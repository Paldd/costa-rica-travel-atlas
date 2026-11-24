"""Read allowlisted catalogs, respect robots rules, and write candidates for review."""

import argparse
import concurrent.futures
import datetime
import hashlib
import html
from html.parser import HTMLParser
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from pathlib import Path

from build_catalog import DATA, PUBLISHER_FIELDS, read_sources, read_table

AGENT = "CostaRicaTravelAtlas"
MAX_BYTES = 3_000_000


def host(url):
    return (urllib.parse.urlsplit(url).hostname or "").lower().removeprefix("www.")


def encoded_path(path):
    return urllib.parse.quote(path, safe="/%:@!$&'()*+,;=")


def package_query(location):
    if host(location.geturl()) != "liriolodge.com" or location.path.lower().rstrip("/") not in {"/paquete", "/en/package"}:
        return ""
    package_ids = urllib.parse.parse_qs(location.query).get("toursys_package_id", [])
    if len(package_ids) == 1 and re.fullmatch(r"[0-9]+", package_ids[0]):
        return urllib.parse.urlencode({"toursys_package_id": package_ids[0]})
    return ""


def canonical(url):
    parsed = urllib.parse.urlsplit(url)
    address = host(url) + encoded_path(parsed.path).lower().rstrip("/")
    query = package_query(parsed)
    return address + ("?" + query if query else "")


def sitemap_date(value):
    try:
        return datetime.date.fromisoformat(value.strip()[:10]).isoformat()
    except ValueError:
        return ""


class SameSiteRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https" or host(req.full_url) != host(newurl):
            raise ValueError("redirect outside the registered source")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self.target = None
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.target = dict(attrs).get("href")
            self.text = []

    def handle_data(self, data):
        if self.target:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.target:
            label = re.sub(r"\s+", " ", " ".join(self.text)).strip()
            self.results.append((self.target, label))
            self.target = None


def request(opener, url):
    parsed = urllib.parse.urlsplit(url)
    address = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, encoded_path(parsed.path), parsed.query, ""))
    req = urllib.request.Request(address, headers={"User-Agent": AGENT + "/1.0 (editorial source index)"})
    with opener.open(req, timeout=16) as response:
        return response.read(MAX_BYTES), response.url


def robots_rules(opener, target):
    robots_url = urllib.parse.urljoin(target, "/robots.txt")
    parser = urllib.robotparser.RobotFileParser(robots_url)
    try:
        body, _ = request(opener, robots_url)
    except urllib.error.HTTPError as error:
        if error.code in (404, 410):
            return None
        raise
    parser.parse(body.decode("utf-8", errors="replace").splitlines())
    return parser


def sitemap_links(opener, target, archive, rules):
    receipt = {"url": target, "status": "unavailable"}
    try:
        if urllib.parse.urlsplit(target).scheme != "https" or host(target) != host(archive):
            raise ValueError("sitemap outside the registered source")
        if rules and not rules.can_fetch(AGENT, target):
            return [], {**receipt, "status": "robots-disallow"}
        body, _ = request(opener, target)
        root = ET.fromstring(body)
        if root.tag.rsplit("}", 1)[-1] != "urlset":
            raise ValueError("expected an article sitemap")
        links = []
        for entry in root.findall("./{*}url"):
            address = entry.findtext("{*}loc", "").strip()
            if address:
                links.append((address, "", sitemap_date(entry.findtext("{*}lastmod", ""))))
        return links, {**receipt, "status": "read", "urls": len(links)}
    except (urllib.error.URLError, OSError, ValueError, ET.ParseError) as error:
        return [], {**receipt, "reason": str(error)[:180]}


def inspect(feed, known, publisher_archives=()):
    target = feed["url"]
    result = {"source": feed["name"], "url": target, "status": "unread", "candidates": []}
    opener = urllib.request.build_opener(SameSiteRedirect())
    try:
        rules = robots_rules(opener, target)
        if rules and not rules.can_fetch(AGENT, target):
            result["status"] = "robots-disallow"
            return result
        body, fetched = request(opener, target)
        parser = Links()
        parser.feed(body.decode("utf-8", errors="replace"))
        matches = {}
        links = [(href, title, "") for href, title in parser.results]
        exact_paths = feed.get("exactPaths", ())
        is_publisher_archive = canonical(target) in publisher_archives
        fetched_key = canonical(fetched)
        links.extend((path, "", "") for path in exact_paths)
        exact_matches = {path.lower().rstrip("/") for path in exact_paths}
        prefixes = tuple(prefix.lower() for prefix in feed.get("paths", ()))
        if feed.get("sitemap"):
            extra, result["sitemap"] = sitemap_links(opener, feed["sitemap"], fetched, rules)
            links = links + extra
        for href, title, last_modified in links:
            location = urllib.parse.urlsplit(urllib.parse.urljoin(fetched, html.unescape(href)))
            query = package_query(location)
            url = urllib.parse.urlunsplit((location.scheme, location.netloc, encoded_path(location.path), query, ""))
            if location.scheme != "https" or host(url) != host(fetched) or (rules and not rules.can_fetch(AGENT, url)):
                continue
            path = location.path.lower()
            matches_prefix = any(path.startswith(prefix) and (query or path.rstrip("/") != prefix.rstrip("/"))
                                 for prefix in prefixes)
            matches_exact = path.rstrip("/") in exact_matches
            if not (matches_prefix or matches_exact):
                continue
            candidate = canonical(url)
            if candidate == fetched_key and not (is_publisher_archive and matches_exact):
                continue
            if candidate not in matches:
                matches[candidate] = {"url": url, "title": (title or location.path.strip("/").split("/")[-1])[:180]}
            match = matches[candidate]
            if len(title) > len(match["title"]):
                match["title"] = title[:180]
            if last_modified > match.get("lastModified", ""):
                match["lastModified"] = last_modified
        result.update(status="read", fingerprint=hashlib.sha256(body).hexdigest(),
                      candidates=sorted((row for key, row in matches.items() if key != fetched_key and key not in known),
                                        key=lambda x: x["url"]))
        if is_publisher_archive:
            result["archivePages"] = list(matches.values())
    except (urllib.error.URLError, OSError, ValueError) as error:
        result.update(status="unavailable", reason=str(error)[:180])
    return result


def editorial_feeds(feeds, sources):
    reviewed = {}
    for feed in feeds:
        source_id = feed.get("review")
        if source_id is None:
            continue
        if source_id not in sources or canonical(feed["url"]) != canonical(sources[source_id]):
            raise ValueError(f"Invalid review source {source_id} for {feed['url']}")
        reviewed[source_id] = feed["url"]
    return reviewed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".cache/refresh.json"))
    parser.add_argument("--check-config", action="store_true", help="validate feed and source references without fetching")
    config = parser.parse_args()
    feeds = [feed for feed in json.loads((DATA / "feeds.json").read_text()) if feed.get("paths") or feed.get("exactPaths")]
    sources = {row["id"]: row["url"] for row in read_sources()}
    known = {canonical(url) for url in sources.values()}
    publisher_archives = {canonical(sources[row["archive"]]) for row in read_table(DATA / "profile-publishers.tsv", PUBLISHER_FIELDS)
                          if row["archive"]}
    publisher_archives.update(canonical(url) for url in editorial_feeds(feeds, sources).values())
    if config.check_config:
        print(f"{len(feeds)} feeds and {len(publisher_archives)} publisher archives validated")
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda feed: inspect(feed, known, publisher_archives), feeds))
    summary = {
        "timeUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "feeds": len(results),
        "read": sum(r["status"] == "read" for r in results),
        "candidateUrls": len({canonical(item["url"]) for r in results for item in r["candidates"]}),
    }
    config.out.parent.mkdir(parents=True, exist_ok=True)
    config.out.write_text(json.dumps({**summary, "results": results}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    if not summary["read"]:
        raise SystemExit("None of the source catalogs returned readable data")


if __name__ == "__main__":
    main()
