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

from build_catalog import DATA, PUBLISHER_FIELDS, SOURCE_FIELDS, read_table

AGENT = "CostaRicaTravelAtlas"
MAX_BYTES = 3_000_000


def host(url):
    return (urllib.parse.urlsplit(url).hostname or "").lower().removeprefix("www.")


def canonical(url):
    parsed = urllib.parse.urlsplit(url)
    return host(url) + parsed.path.lower().rstrip("/")


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
    req = urllib.request.Request(url, headers={"User-Agent": AGENT + "/1.0 (editorial source index)"})
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
        if feed.get("sitemap"):
            extra, result["sitemap"] = sitemap_links(opener, feed["sitemap"], fetched, rules)
            links = links + extra
        for href, title, last_modified in links:
            location = urllib.parse.urlsplit(urllib.parse.urljoin(fetched, html.unescape(href)))
            url = urllib.parse.urlunsplit((location.scheme, location.netloc, location.path, "", ""))
            if location.scheme != "https" or host(url) != host(fetched) or (rules and not rules.can_fetch(AGENT, url)):
                continue
            if not any(location.path.lower().startswith(path) and
                       location.path.rstrip("/") != path.rstrip("/") for path in feed["paths"]):
                continue
            candidate = canonical(url)
            if candidate == canonical(fetched):
                continue
            if candidate not in matches:
                matches[candidate] = {"url": url, "title": (title or location.path.strip("/").split("/")[-1])[:180]}
            match = matches[candidate]
            if len(title) > len(match["title"]):
                match["title"] = title[:180]
            if last_modified > match.get("lastModified", ""):
                match["lastModified"] = last_modified
        result.update(status="read", fingerprint=hashlib.sha256(body).hexdigest(),
                      candidates=sorted((row for key, row in matches.items() if key not in known), key=lambda x: x["url"]))
        if canonical(target) in publisher_archives:
            result["archivePages"] = list(matches.values())
    except (urllib.error.URLError, OSError, ValueError) as error:
        result.update(status="unavailable", reason=str(error)[:180])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".cache/refresh.json"))
    config = parser.parse_args()
    feeds = [feed for feed in json.loads((DATA / "feeds.json").read_text()) if feed.get("paths")]
    sources = {row["id"]: canonical(row["url"]) for row in read_table(DATA / "sources.tsv", SOURCE_FIELDS)}
    known = set(sources.values())
    publisher_archives = {sources[row["archive"]] for row in read_table(DATA / "profile-publishers.tsv", PUBLISHER_FIELDS)
                          if row["archive"]}
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
