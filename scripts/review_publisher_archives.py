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
from review_social_posts import COMMON_NAMES, PLACE_NAME, TOPICS, publication


SKIP = {
    "aside", "button", "footer", "form", "header", "nav", "noscript", "script", "style", "svg", "template",
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
SECTION_PATH = re.compile(r"/(?:author|authors|category|categoria|tag|tags|page|search|searchtag)(?:/|$)", re.I)
MIN_BODY_CHARS = 350
ARTICLE_BODY_CLASSES = {
    "ContentSideBySide", "adventure--detail", "blogDetailBodyContent", "elementor-widget-theme-post-content",
    "full-description", "section-gutenberg",
}
EXTRACTOR_VERSION = 11
CATALOG_MATCH_VERSION = 1
SOCIAL_HOSTS = {"facebook.com": "Facebook", "m.facebook.com": "Facebook", "web.facebook.com": "Facebook", "instagram.com": "Instagram"}
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
VIDEO_METADATA = {"og:video", "og:video:url", "og:video:secure_url", "twitter:player"}


def youtube_url(value):
    try:
        link = urlsplit(value)
        domain = (link.hostname or "").removeprefix("www.").removeprefix("m.")
    except ValueError:
        return None
    if domain not in {"youtube.com", "youtube-nocookie.com", "youtu.be", "i.ytimg.com"}:
        return None
    path = link.path.strip("/").split("/")
    if path == ["watch"]:
        video = parse_qs(link.query).get("v", [""])[0]
    elif len(path) >= 2 and path[0] in {"embed", "shorts", "live", "vi", "vi_webp"}:
        video = path[1]
    elif domain == "youtu.be":
        video = path[0]
    else:
        return None
    return f"https://www.youtube.com/watch?v={video}" if VIDEO_ID.fullmatch(video) else None


def editorial_url(url):
    return not SECTION_PATH.search(urlsplit(url).path)


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
        self.video_placements = {}

    def handle_starttag(self, tag, raw_attrs):
        attrs = dict(raw_attrs)
        if tag == "meta" and (name := attrs.get("property") or attrs.get("name")):
            name = name.lower()
            value = attrs.get("content") or ""
            self.metadata[name] = value
            if name in VIDEO_METADATA:
                self.add_video(value, "metadata")
        excluded = "hidden" in attrs or attrs.get("aria-hidden") == "true"
        if tag not in VOID:
            classes = set((attrs.get("class") or "").split())
            wordpress_post = (attrs.get("id") or "").startswith("post-") and {"type-post", "hentry"} <= classes
            content = (
                tag in {"article", "main"} or attrs.get("role") == "main" or attrs.get("itemprop") == "articleBody"
                or attrs.get("id") in {"content", "main-content", "main-blog-content", "article-content", "dnn_content"}
                or attrs.get("data-elementor-type") in {"wp-post", "wp-page"}
                or bool(classes & ARTICLE_BODY_CLASSES) or wordpress_post
                or attrs.get("id") == "tnCol" and "boxSize" in classes
            )
            # DNN and nopCommerce wrap editorial text in the platform's layout form.
            form_id = attrs.get("id")
            layout_form = tag == "form" and (
                form_id == "product-details-form"
                or form_id == "Form" and self.stack and self.stack[-1][0] == "body"
            )
            excluded = excluded or tag in SKIP and not layout_form
            self.stack.append((tag, content, excluded))
            self.main_depth += content
            self.skip_depth += excluded
        placement = "article" if self.main_depth and not (self.skip_depth or excluded) else "elsewhere"
        for key in ("href", "src", "data-src", "data-href", "data-instgrm-permalink"):
            if value := attrs.get(key):
                self.add_media(value, placement)
        if attrs.get("data-widget_type") == "video.default" and (settings := attrs.get("data-settings")):
            try:
                video_widget = json.loads(settings)
            except json.JSONDecodeError:
                return
            if isinstance(video_widget, dict) and isinstance(value := video_widget.get("youtube_url"), str):
                self.add_video(value, placement)

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

    def add_video(self, value, placement):
        if url := youtube_url(value):
            self.video_placements.setdefault(url, set()).add(placement)

    def add_media(self, value, placement):
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
        self.add_video(value, placement)


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
                if not editorial_url(fetched):
                    results.append({**entry, "status": "navigation-page", "finalUrl": fetched})
                    continue
                parser = EditorialPage()
                parser.feed(raw.decode("utf-8", errors="replace"))
                body = " ".join(" ".join(parser.main).split())
                title = parser.metadata.get("og:title") or next(iter(parser.heading), "") or row["title"]
                videos = sorted(parser.video_placements, key=lambda url: (
                    "article" not in parser.video_placements[url],
                    "metadata" not in parser.video_placements[url],
                    url,
                ))[:20]
                entry.update(title=title.strip()[:180], finalUrl=fetched, chars=len(body),
                             fingerprint=hashlib.sha256(body.encode()).hexdigest(),
                             date=parser.metadata.get("article:published_time", "")[:10],
                             videoLinks=videos,
                             videoPlacements={url: sorted(parser.video_placements[url]) for url in videos},
                             socialLinks=[{"platform": platform, "url": link} for platform, link in sorted(parser.social)])
                if len(body) >= MIN_BODY_CHARS:
                    entry.update(status="read", catalogMatchVersion=CATALOG_MATCH_VERSION, **analyze(title, body))
                else:
                    entry["status"] = "no-editorial-text"
        except (URLError, OSError, ValueError) as error:
            entry["reason"] = str(error)[:170]
        results.append(entry)
    return results


def analyzer():
    rows = read_records()
    terms = {}
    context = {}
    for row in rows:
        row_id = row["id"]
        for name in recurring_names(row):
            terms.setdefault(name, set()).add(row_id)
            if name not in COMMON_NAMES:
                continue
            qualifiers = set()
            for part in row["native"].split(" · ")[1:]:
                qualifier = normalized(part)
                if qualifier != name and len(qualifier) >= 7:
                    qualifiers.add(qualifier)
                    short, _, _ = qualifier.partition(" de ")
                    if len(short.split()) >= 2:
                        qualifiers.add(short)
            if qualifiers:
                context[row_id, name] = re.compile(
                    r"(?<!\w)(?:" + "|".join(map(re.escape, sorted(qualifiers))) + r")(?!\w)"
                )
    names = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, sorted(terms, key=len, reverse=True))) + r")(?!\w)")
    signals = {topic: re.compile(r"\b(?:" + pattern + r")\b") for topic, pattern in TOPICS.items()}

    def analyze(title, body):
        text = normalized(f"{title} {body}")
        matches = set()
        for hit in names.finditer(text):
            name = hit.group()
            if name not in COMMON_NAMES:
                matches.update(terms[name])
                continue
            nearby = text[max(0, hit.start() - 230):hit.end() + 230]
            for key in terms[name]:
                qualifier = context.get((key, name))
                if qualifier and qualifier.search(nearby):
                    matches.add(key)
        places = list(dict.fromkeys(name.group() for name in PLACE_NAME.finditer(f"{title} {body}")))
        return {"activitySignals": [key for key, pattern in signals.items() if pattern.search(text)],
                "catalogMatches": sorted(matches), "placeCandidates": places[:12]}

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
    if status == "read" and entry.get("catalogMatches") and entry.get("catalogMatchVersion") != CATALOG_MATCH_VERSION:
        return True
    if status in {"read", "no-editorial-text"} and has_update(entry, row):
        return True
    days = 30 if status in {"read", "robots-disallow"} else 3
    return today - datetime.date.fromisoformat(entry["checked"]) >= datetime.timedelta(days=days)


def archive_pages(result, archive):
    pages = {}
    for row in result.get("archivePages", result.get("candidates", [])):
        url = row["url"]
        if host(url) == host(archive) and editorial_url(url):
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
        for receipt in state.get(archive_id, {}).values():
            row = last_successful_read(receipt) or receipt
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


def video_candidates(state, archives, catalog):
    known_videos = {video for url in catalog.values() if (video := youtube_url(url))}
    links = {}
    for archive_id, profiles in sorted(archives.items()):
        for row in state.get(archive_id, {}).values():
            if row["status"] != "read" or not row.get("videoLinks"):
                continue
            article = row["finalUrl"]
            key = (archive_id, canonical(article))
            for link in row["videoLinks"]:
                if not (url := youtube_url(link)):
                    continue
                placement = row.get("videoPlacements", {}).get(link, ["unclassified"])
                reference = {
                    "article": article, "archive": catalog[archive_id], "title": row["title"],
                    "articleCheckedUtc": row["checked"], "publisherProfiles": sorted(profiles),
                    "placement": placement,
                    "catalogMatches": (row.get("catalogMatches", [])
                                       if row.get("catalogMatchVersion") == CATALOG_MATCH_VERSION else []),
                }
                references = links.setdefault(url, {})
                previous = references.get(key)
                if not previous or reference["articleCheckedUtc"] > previous["articleCheckedUtc"]:
                    references[key] = reference
    candidates = [
        {"url": url, "inSourceRegistry": url in known_videos,
         "references": [references[key] for key in sorted(references)]}
        for url, references in links.items()
    ]
    return sorted(candidates, key=lambda row: (
        row["inSourceRegistry"],
        not any("article" in ref["placement"] for ref in row["references"]),
        row["url"],
    ))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def last_successful_read(entry):
    return entry if entry.get("status") == "read" else entry.get("lastSuccessful")


def restore_public_receipts(state, archives, catalog, snapshot):
    social_links = {}
    for candidate in snapshot.get("nativeCandidates", []):
        key = canonical(candidate["article"])
        social_links.setdefault(key, []).append({"platform": candidate["platform"], "url": candidate["url"]})
    for archive_id, coverage in snapshot.get("bySource", {}).items():
        if archive_id not in archives:
            continue
        previous = state.setdefault(archive_id, {})
        for page in coverage.get("pages", []):
            url = page["url"]
            if host(url) != host(catalog[archive_id]) or not editorial_url(url):
                continue
            key = canonical(url)
            entry = previous.get(key, {})
            if last_successful_read(entry):
                continue
            receipt = {
                "status": "read", "url": url, "finalUrl": url, "title": page["title"],
                "checked": page.get("checked") or snapshot["dayUtc"], "date": page.get("published", ""),
                "socialLinks": social_links.get(key, []),
            }
            if entry:
                entry["lastSuccessful"] = receipt
            else:
                previous[key] = receipt


def public_native_candidates(candidates, article_keys):
    rows = []
    for candidate in candidates:
        references = [ref for ref in candidate["references"] if canonical(ref["article"]) in article_keys]
        if references:
            latest = max(references, key=lambda ref: ref["articleCheckedUtc"])
            rows.append({"platform": candidate["platform"], "url": candidate["url"], "article": latest["article"],
                         "title": latest["title"], "checked": latest["articleCheckedUtc"]})
    return sorted(rows, key=lambda row: row["checked"], reverse=True)


def public_coverage(summary, results, history, run_url, native_candidates):
    keys = ("dayUtc", "archives", "archivesRead", "pagesChecked", "pagesRead", "pagesReadToDate")
    latest = {canonical(article["finalUrl"]) for source in results for article in source.get("checked", [])
              if article["status"] == "read"}
    coverage = {}
    seen = set()
    ordered = sorted(results, key=lambda source: (not source["profiles"], source["status"] != "read", source["sourceId"]))
    for source in ordered:
        archive_id = source["sourceId"]
        pages = []
        for article in sorted(history[archive_id], key=lambda row: row["checked"], reverse=True):
            url = article["finalUrl"]
            article_key = canonical(url)
            if article_key in seen:
                continue
            seen.add(article_key)
            title = " ".join(article["title"].split())
            page = {"url": url, "title": title or source["archive"], "checked": article["checked"]}
            if published := sitemap_date(article.get("date", "")):
                page["published"] = published
            if article_key in latest:
                page["readThisRun"] = True
            pages.append(page)
        if source["status"] == "read" or pages:
            coverage[archive_id] = {
                "indexed": source.get("indexedPages"), "read": source.get("indexedPagesRead"),
                "pages": sorted(pages, key=lambda page: (page["checked"], page.get("published", ""), page["title"]), reverse=True),
            }
    if len(seen) != summary["pagesReadToDate"] or len(latest) != summary["pagesRead"] or not latest <= seen:
        raise ValueError("Public coverage does not match the reviewed pages")
    return {**{key: summary[key] for key in keys}, "runUrl": run_url, "history": True, "bySource": coverage,
            "nativeCandidates": public_native_candidates(native_candidates, seen)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", type=Path, default=Path(".cache/refresh.json"))
    parser.add_argument("--out", type=Path, default=Path(".cache/publisher-review.json"))
    parser.add_argument("--state", type=Path, default=Path(".cache/publisher-archive-state.json"))
    parser.add_argument("--per-archive", type=int, default=5)
    parser.add_argument("--public-coverage", type=Path)
    parser.add_argument("--run-url")
    args = parser.parse_args()
    if args.public_coverage and not args.run_url:
        parser.error("--public-coverage requires --run-url")
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
    state = {
        archive_id: {
            key: entry for key, entry in pages.items()
            if editorial_url(entry["url"])
            and editorial_url((last_successful_read(entry) or entry).get("finalUrl", entry["url"]))
        }
        for archive_id, pages in read_json(args.state, {}).items()
    }
    restore_public_receipts(state, archives, catalog, read_json(DATA / "publisher-review-coverage.json", {}))
    current = []
    analyze = analyzer()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {}
        for archive_id, profiles in sorted(archives.items()):
            archive = catalog[archive_id]
            result = index.get(canonical(archive))
            if not result or result["status"] != "read":
                current.append({"archive": archive, "sourceId": archive_id, "profiles": profiles,
                                "status": result["status"] if result else "unconfigured"})
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
                key = canonical(row["url"])
                receipt = {**row, "checked": day.isoformat()}
                if row["status"] != "read" and (verified := last_successful_read(previous.get(key, {}))):
                    receipt["lastSuccessful"] = verified
                previous[key] = receipt
            indexed_read = sum(previous.get(key, {}).get("status") == "read" for key in pages)
            current.append({"archive": catalog[archive_id], "sourceId": archive_id, "profiles": archives[archive_id], "status": "read",
                            "checked": batch, "indexedPages": len(pages), "indexedPagesRead": indexed_read,
                            "readToDate": sum(row["status"] == "read" for row in previous.values())})

    pages = [row for source in current for row in source.get("checked", [])]
    pages_read = {canonical(row["finalUrl"]) for row in pages if row["status"] == "read"}
    history = {
        key: [receipt for row in state.get(key, {}).values() if (receipt := last_successful_read(row))]
        for key in archives
    }
    all_pages_read = {canonical(row["finalUrl"]) for pages in history.values() for row in pages}
    native_candidates = social_candidates(state, archives, catalog)
    videos = video_candidates(state, archives, catalog)
    summary = {"dayUtc": day.isoformat(), "archives": len(archives),
               "archivesRead": sum(row["status"] == "read" for row in current),
               "profileArchives": sum(bool(profiles) for profiles in archives.values()),
               "independentArchives": sum(not profiles for profiles in archives.values()),
               "pagesChecked": len(pages), "pagesRead": len(pages_read),
               "pagesReadToDate": len(all_pages_read),
               "videoLinks": len({link for row in pages for link in row.get("videoLinks", [])}),
               "videoCandidatesToDate": len(videos),
               "videosMissingSource": sum(not row["inSourceRegistry"] for row in videos),
               "socialLinks": len({link["url"] for row in pages for link in row.get("socialLinks", [])}),
               "socialLinksToDate": len(native_candidates)}
    write_json(args.state, state)
    write_json(args.out, {**summary, "results": current, "socialCandidates": native_candidates, "videoCandidates": videos})
    if args.public_coverage:
        write_json(args.public_coverage, public_coverage(summary, current, history, args.run_url, native_candidates))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
