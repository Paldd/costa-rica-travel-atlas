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
from pathlib import Path

from build_catalog import DATA, SOURCE_FIELDS, read_table

AGENT = "CostaRicaTravelAtlas"
MAX_BYTES = 3_000_000


def host(url):
    return (urllib.parse.urlsplit(url).hostname or "").lower().removeprefix("www.")


def canonical(url):
    parsed = urllib.parse.urlsplit(url)
    return host(url) + parsed.path.lower().rstrip("/")


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


def respect_robots(opener, target):
    robots_url = urllib.parse.urljoin(target, "/robots.txt")
    parser = urllib.robotparser.RobotFileParser(robots_url)
    try:
        body, _ = request(opener, robots_url)
    except urllib.error.HTTPError as error:
        if error.code in (404, 410):
            return True
        raise
    parser.parse(body.decode("utf-8", errors="replace").splitlines())
    return parser.can_fetch(AGENT, target)


def inspect(feed, known):
    target = feed["url"]
    result = {"source": feed["name"], "url": target, "status": "unread", "candidates": []}
    opener = urllib.request.build_opener(SameSiteRedirect())
    try:
        if not respect_robots(opener, target):
            result["status"] = "robots-disallow"
            return result
        body, fetched = request(opener, target)
        parser = Links()
        parser.feed(body.decode("utf-8", errors="replace"))
        matches = {}
        for href, title in parser.results:
            location = urllib.parse.urlsplit(urllib.parse.urljoin(fetched, html.unescape(href)))
            url = urllib.parse.urlunsplit((location.scheme, location.netloc, location.path, "", ""))
            if location.scheme != "https" or host(url) != host(fetched):
                continue
            if not any(location.path.lower().startswith(path) and
                       location.path.rstrip("/") != path.rstrip("/") for path in feed["paths"]):
                continue
            candidate = canonical(url)
            if candidate not in known and candidate != canonical(fetched):
                match = {"url": url, "title": (title or location.path.strip("/").split("/")[-1])[:180]}
                if candidate not in matches or len(match["title"]) > len(matches[candidate]["title"]):
                    matches[candidate] = match
        result.update(status="read", fingerprint=hashlib.sha256(body).hexdigest(),
                      candidates=sorted(matches.values(), key=lambda x: x["url"]))
    except (urllib.error.URLError, OSError, ValueError) as error:
        result.update(status="unavailable", reason=str(error)[:180])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".cache/refresh.json"))
    config = parser.parse_args()
    feeds = json.loads((DATA / "feeds.json").read_text())
    known = {canonical(row["url"]) for row in read_table(DATA / "sources.tsv", SOURCE_FIELDS)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda feed: inspect(feed, known), feeds))
    summary = {
        "timeUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "feeds": len(results),
        "read": sum(r["status"] == "read" for r in results),
        "candidateUrls": len({item["url"] for r in results for item in r["candidates"]}),
    }
    config.out.parent.mkdir(parents=True, exist_ok=True)
    config.out.write_text(json.dumps({**summary, "results": results}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    if not summary["read"]:
        raise SystemExit("None of the source catalogs returned readable data")


if __name__ == "__main__":
    main()
