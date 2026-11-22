"""Read public publisher pages discovered by refresh.py and keep text-free evidence."""

import argparse
import concurrent.futures
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import build_opener

from build_catalog import DATA, PUBLISHER_FIELDS, read_records, read_sources, read_table
from import_social import normalized, recurring_names
from refresh import AGENT, SameSiteRedirect, canonical, editorial_feeds, host, request, robots_rules, sitemap_date
from review_social_posts import PLACE_NAME, TOPICS, publication


SKIP = {
    "aside", "button", "footer", "form", "header", "nav", "noscript", "script", "style", "svg", "template",
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
SECTION_PATH = re.compile(r"/(?:author|authors|category|categoria|tag|tags|page|search)(?:/|$)", re.I)
MIN_BODY_CHARS = 350
ARTICLE_BODY_CLASSES = {
    "adventure--detail", "blogDetailBodyContent", "elementor-widget-theme-post-content", "section-gutenberg",
}
EXTRACTOR_VERSION = 7
SOCIAL_HOSTS = {"facebook.com": "Facebook", "m.facebook.com": "Facebook", "web.facebook.com": "Facebook", "instagram.com": "Instagram"}
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")


class EditorialPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.main_depth = 0
        self.skip_depth = 0
        self.main = []
        self.heading = []
        self.metadata = {}
        self.social = set()
        self.videos = set()

    def handle_starttag(self, tag, raw_attrs):
        attrs = dict(raw_attrs)
        if tag == "meta" and (name := attrs.get("property") or attrs.get("name")):
            self.metadata[name.lower()] = attrs.get("content") or ""
        for key in ("href", "src", "data-src", "data-href", "data-instgrm-permalink"):
            if value := attrs.get(key):
                self.add_media(value)
        if tag not in VOID:
            classes = set((attrs.get("class") or "").split())
            wordpress_post = (attrs.get("id") or "").startswith("post-") and {"type-post", "hentry"} <= classes
            content = (
                tag in {"article", "main"} or attrs.get("role") == "main" or attrs.get("itemprop") == "articleBody"
                or attrs.get("id") in {"content", "main-content", "main-blog-content", "article-content", "dnn_content"}
                or attrs.get("data-elementor-type") in {"wp-post", "wp-page"}
                or bool(classes & ARTICLE_BODY_CLASSES) or wordpress_post
            )
            # DNN wraps the page in a form, with editorial content inside dnn_content.
            layout_form = tag == "form" and attrs.get("id") == "Form" and self.stack and self.stack[-1][0] == "body"
            exclude = (tag in SKIP and not layout_form) or "hidden" in attrs or attrs.get("aria-hidden") == "true"
            self.stack.append((tag, content, exclude))
            self.main_depth += content
            self.skip_depth += exclude

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                for _, content, exclude in self.stack[index:]:
                    self.main_depth -= content
                    self.skip_depth -= exclude
                del self.stack[index:]
                return

    def handle_data(self, value):
        if self.skip_depth or not (value := value.strip()):
            return
        if self.main_depth:
            self.main.append(value)
        if self.stack and self.stack[-1][0] in {"h1", "title"}:
            self.heading.append(value)

    def add_media(self, value):
        try:
            link = urlsplit(value)
            domain = (link.hostname or "").removeprefix("www.")
            platform = SOCIAL_HOSTS.get(domain)
            if platform == "Facebook" and link.path.startswith("/plugins/"):
                value = parse_qs(link.query).get("href", [""])[0]
        except ValueError:
            return
        if platform and (resolved := publication(value, platform)):
            self.social.add((platform, resolved[1]))
        if domain in {"youtube.com", "youtube-nocookie.com", "youtu.be", "i.ytimg.com"}:
            path = link.path.strip("/").split("/")
            video = parse_qs(link.query).get("v", [""])[0] if path == ["watch"] else ""
            if len(path) >= 2 and path[0] in {"embed", "shorts", "vi", "vi_webp"}:
                video = path[1]
            if domain == "youtu.be":
                video = path[0]
            if VIDEO_ID.fullmatch(video):
                self.videos.add(f"https://www.youtube.com/watch?v={video}")


class ArchiveRedirect(SameSiteRedirect):
    def __init__(self, rules):
        self.rules = rules

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = super().redirect_request(req, fp, code, msg, headers, newurl)
        if self.rules and target and not self.rules.can_fetch(AGENT, target.full_url):
            raise ValueError("redirect not allowed by robots.txt")
        return target


def read_archive(archive, urls, analyze):
    try:
        rules = robots_rules(build_opener(SameSiteRedirect()), archive)
    except (URLError, OSError, ValueError) as error:
        return [{**row, "status": "unavailable", "reason": str(error)[:170]} for row in urls]

    opener = build_opener(ArchiveRedirect(rules))
    results = []
    for row in urls:
        url = row["url"]
        entry = {**row, "status": "unavailable", "extractorVersion": EXTRACTOR_VERSION}
        try:
            if rules and not rules.can_fetch(AGENT, url):
                entry["status"] = "robots-disallow"
            else:
                raw, fetched = request(opener, url)
                parser = EditorialPage()
                parser.feed(raw.decode("utf-8", errors="replace"))
                body = " ".join(" ".join(parser.main).split())
                title = parser.metadata.get("og:title") or next(iter(parser.heading), "") or row["title"]
                entry.update(title=title.strip()[:180], finalUrl=fetched, chars=len(body),
                             fingerprint=hashlib.sha256(body.encode()).hexdigest(),
                             date=parser.metadata.get("article:published_time", "")[:10],
                             videoLinks=sorted(parser.videos)[:20],
                             socialLinks=[{"platform": platform, "url": link} for platform, link in sorted(parser.social)][:20])
                if len(body) >= MIN_BODY_CHARS:
                    entry.update(status="read", **analyze(title, body))
                else:
                    entry["status"] = "no-editorial-text"
        except (URLError, OSError, ValueError) as error:
            entry["reason"] = str(error)[:170]
        results.append(entry)
    return results


def analyzer():
    rows = read_records()
    terms = {}
    for row in rows:
        for name in recurring_names(row):
            terms.setdefault(name, set()).add(row["id"])
    names = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, sorted(terms, key=len, reverse=True))) + r")(?!\w)")
    signals = {topic: re.compile(r"\b(?:" + pattern + r")\b") for topic, pattern in TOPICS.items()}

    def analyze(title, body):
        text = normalized(f"{title} {body}")
        matches = sorted({key for name in names.findall(text) for key in terms[name]})
        places = list(dict.fromkeys(name.group() for name in PLACE_NAME.finditer(f"{title} {body}")))
        return {"activitySignals": [key for key, pattern in signals.items() if pattern.search(text)],
                "catalogMatches": matches, "placeCandidates": places[:12]}

    return analyze


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def has_update(entry, row):
    return row.get("lastModified", "") > (entry.get("lastModified") or entry["checked"])


def enough_time(entry, row, today):
    if not entry:
        return True
    status = entry["status"]
    if status == "no-editorial-text" and entry.get("extractorVersion") != EXTRACTOR_VERSION:
        return True
    if status in {"read", "no-editorial-text"} and has_update(entry, row):
        return True
    days = 30 if status in {"read", "robots-disallow"} else 3
    return today - datetime.date.fromisoformat(entry["checked"]) >= datetime.timedelta(days=days)


def archive_pages(result, archive):
    pages = {}
    for row in result.get("archivePages", result.get("candidates", [])):
        url = row["url"]
        if host(url) == host(archive) and not SECTION_PATH.search(urlsplit(url).path):
            pages.setdefault(canonical(url), row)
    return pages


def candidates(pages, previous, today):
    ranked = []
    for position, (key, row) in enumerate(pages.items()):
        entry = previous.get(key)
        if enough_time(entry, row, today):
            modified = sitemap_date(row.get("lastModified", ""))
            ordinal = datetime.date.fromisoformat(modified).toordinal() if modified else 0
            routine_recheck = bool(entry and not has_update(entry, row))
            ranked.append((routine_recheck, -ordinal, position, row))
    return [row for _, _, _, row in sorted(ranked)]


def social_candidates(state, archives, catalog):
    links = {}
    for archive_id, profiles in sorted(archives.items()):
        for row in state.get(archive_id, {}).values():
            for link in row.get("socialLinks", []):
                url = link["url"]
                candidate = links.setdefault(url, {"platform": link["platform"], "url": url, "references": {}})
                article = row.get("finalUrl") or row["url"]
                key = (archive_id, canonical(article))
                reference = {"article": article, "archive": catalog[archive_id], "title": row["title"],
                             "articleCheckedUtc": row["checked"], "publisherProfiles": sorted(profiles)}
                references = candidate["references"]
                previous = references.get(key)
                if not previous or reference["articleCheckedUtc"] > previous["articleCheckedUtc"]:
                    references[key] = reference
    candidates = []
    for _, candidate in sorted(links.items()):
        references = candidate.pop("references")
        candidates.append({**candidate, "references": [references[key] for key in sorted(references)]})
    return candidates


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", type=Path, default=Path(".cache/refresh.json"))
    parser.add_argument("--out", type=Path, default=Path(".cache/publisher-review.json"))
    parser.add_argument("--state", type=Path, default=Path(".cache/publisher-archive-state.json"))
    parser.add_argument("--per-archive", type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.per_archive <= 10:
        parser.error("--per-archive must be between 1 and 10")
    if not args.refresh.is_file():
        parser.error("Run refresh.py first")

    day = datetime.datetime.now(datetime.timezone.utc).date()
    catalog = {row["id"]: row["url"] for row in read_sources()}
    archives = {}
    for row in read_table(DATA / "profile-publishers.tsv", PUBLISHER_FIELDS):
        if row["archive"]:
            archives.setdefault(row["archive"], []).append(row["profile"])
    feeds = json.loads((DATA / "feeds.json").read_text())
    for source_id in editorial_feeds(feeds, catalog):
        archives.setdefault(source_id, [])
    index = {canonical(row["url"]): row for row in read_json(args.refresh, {})["results"]}
    state = read_json(args.state, {})
    current = []
    analyze = analyzer()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {}
        for archive_id, profiles in sorted(archives.items()):
            archive = catalog[archive_id]
            result = index.get(canonical(archive))
            if not result or result["status"] != "read":
                current.append({"archive": archive, "profiles": profiles, "status": result["status"] if result else "unconfigured"})
                continue
            previous = state.setdefault(archive_id, {})
            pages = archive_pages(result, archive)
            batch = candidates(pages, previous, day)[:args.per_archive]
            future = pool.submit(read_archive, archive, batch, analyze) if batch else None
            futures[archive_id] = (pages, future)

        for archive_id, (pages, future) in futures.items():
            batch = future.result() if future else []
            previous = state[archive_id]
            for row in batch:
                previous[canonical(row["url"])] = {**row, "checked": day.isoformat()}
            indexed_read = sum(previous.get(key, {}).get("status") == "read" for key in pages)
            current.append({"archive": catalog[archive_id], "profiles": archives[archive_id], "status": "read",
                            "checked": batch, "indexedPages": len(pages), "indexedPagesRead": indexed_read,
                            "readToDate": sum(row["status"] == "read" for row in previous.values())})

    pages = [row for source in current for row in source.get("checked", [])]
    pages_read = {canonical(row["finalUrl"]) for row in pages if row["status"] == "read"}
    all_pages_read = {canonical(row["finalUrl"]) for key in archives for row in state.get(key, {}).values()
                      if row["status"] == "read"}
    native_candidates = social_candidates(state, archives, catalog)
    summary = {"dayUtc": day.isoformat(), "archives": len(archives),
               "archivesRead": sum(row["status"] == "read" for row in current),
               "profileArchives": sum(bool(profiles) for profiles in archives.values()),
               "independentArchives": sum(not profiles for profiles in archives.values()),
               "pagesChecked": len(pages), "pagesRead": len(pages_read),
               "pagesReadToDate": len(all_pages_read),
               "videoLinks": len({link for row in pages for link in row.get("videoLinks", [])}),
               "socialLinks": len({link["url"] for row in pages for link in row.get("socialLinks", [])}),
               "socialLinksToDate": len(native_candidates)}
    write_json(args.state, state)
    write_json(args.out, {**summary, "results": current, "socialCandidates": native_candidates})
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
