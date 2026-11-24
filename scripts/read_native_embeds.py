"""Read public caption widgets for known Instagram and Facebook permalinks."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from threading import Event, Lock
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import build_opener

from build_catalog import DATA, read_sources
from refresh import SameSiteRedirect, request
from review_publisher_archives import VOID
from review_social_posts import publication, profile_key


class CaptionWidget(HTMLParser):
    """Keep only rendered caption, author and publication details."""

    def __init__(self, platform):
        super().__init__()
        self.platform = platform
        self.stack = []
        self.caption = []
        self.author = []
        self.links = []
        self.collaborators = set()
        self.owner = None
        self.timestamp = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = set((attrs.get("class") or "").split())
        caption, author, excluded = self.stack[-1][1:] if self.stack else (False, False, False)
        excluded = (
            excluded or tag in {"script", "style", "noscript", "template"}
            or "hidden" in attrs or attrs.get("data-log-event") == "captionCommentsClick"
        )
        if not excluded:
            caption = caption or "Caption" in classes or attrs.get("data-testid") == "post_message"
            caption_author = "CaptionUsername" in classes
            facebook_author = "_2_79" in classes if self.platform == "Facebook" else False
            href = attrs.get("href")
            if href and tag == "a":
                href = urljoin("https://www.facebook.com/", href) if self.platform == "Facebook" else href
                link = urlsplit(href)
                if (self.platform == "Facebook" and not caption and not self.owner
                        and attrs.get("title") and link.hostname == "www.facebook.com"):
                    page = re.fullmatch(r"/watch/([A-Za-z0-9_.-]+)/?", link.path)
                    if page:
                        name = page[1]
                        profile = "profile.php?id=" + name if name.isdigit() else name
                        self.owner = "https://www.facebook.com/" + profile
                    elif ("ref=embed_video" in link.query.split("&")
                          and re.fullmatch(r"/[A-Za-z0-9_.-]+/?", link.path)):
                        self.owner = href
                    if self.owner:
                        self.author = [attrs["title"]]
                self.links.append(href)
                if caption_author:
                    self.owner = href
                if "CollabAvatar" in classes and self.platform == "Instagram":
                    if collaborator := profile_key(href, self.platform):
                        self.collaborators.add(collaborator)
            author = author or caption_author or facebook_author
            if self.timestamp is None and tag == "abbr":
                if stamp := attrs.get("data-utime"):
                    if stamp.isdigit() and len(stamp) <= 10:
                        self.timestamp = int(stamp)
        if tag not in VOID:
            self.stack.append((tag, caption, author, excluded))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                return

    def handle_data(self, text):
        if not self.stack or not (text := text.strip()):
            return
        _, caption, author, excluded = self.stack[-1]
        if excluded:
            return
        if author:
            self.author.append(text)
        elif caption:
            self.caption.append(text)

    def result(self, original):
        if self.platform == "Facebook" and self.owner is None:
            original_page = urlsplit(original).path.split("/")[1]
            # A dated embedded post can link to its numeric canonical ID.
            published_links = [
                urlsplit(href).path.split("/") for href in self.links
                if urlsplit(href).hostname == "www.facebook.com"
            ]
            if any(len(path) >= 4 and path[1].lower() == original_page.lower() and path[2] == "posts"
                   for path in published_links):
                self.owner = f"https://www.facebook.com/{original_page}"
        result = {"caption": " ".join(self.caption), "author": " ".join(dict.fromkeys(self.author))}
        if self.owner:
            result["owner"] = profile_key(self.owner, self.platform)
        if others := sorted(self.collaborators - {result.get("owner")}):
            result["collaborators"] = others
        if self.timestamp:
            result["published"] = datetime.fromtimestamp(self.timestamp, timezone.utc).date().isoformat()
        return result


def candidates(extra_urls):
    review = json.loads((DATA / "publisher-review-coverage.json").read_text(encoding="utf-8"))
    values = [
        *((None, value) for value in extra_urls),
        *((item["platform"], item["url"]) for item in review.get("nativeCandidates", [])),
        *((None, item["url"]) for item in read_sources()),
    ]
    result = {}
    for platform, url in values:
        if platform is None:
            host = urlsplit(url).hostname
            platform = "Instagram" if host in {"www.instagram.com", "instagram.com"} else "Facebook"
        if resolved := publication(url, platform):
            key, canonical = resolved
            if platform == "Instagram":
                url = canonical.replace("/p/", "/reel/") if "/reel/" in url else canonical
            else:
                url = canonical
                if key.startswith("/"):
                    key = key.rstrip("/").split("/")[-1]
            result.setdefault((platform, key), url)
    return result


def widget_url(platform, url):
    if platform == "Instagram":
        return url.rstrip("/") + "/embed/captioned/"
    widget = "video" if re.search(r"/(?:videos|reel)/", urlsplit(url).path) else "post"
    return f"https://www.facebook.com/plugins/{widget}.php?" + urlencode({"href": url, "show_text": "true"})


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--url", action="append", default=[], help="Additional known public permalink")
    cli.add_argument("--limit", type=int, default=60, help="Maximum number of widget requests")
    cli.add_argument("--out", type=Path, default=Path(".cache/native-embeds.json"))
    args = cli.parse_args()
    if args.limit < 1:
        cli.error("--limit must be positive")
    pool = candidates(args.url)
    path = args.out
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
        rows = {(x["platform"], x["id"]): x for x in old["items"] if x["status"] in {"read", "caption-missing"}}
    else:
        rows = {}
    pending = [(key, url) for key, url in pool.items() if key not in rows][:args.limit]
    scheduled = monotonic()
    spacing = Lock()
    limited = Event()

    def read(item):
        nonlocal scheduled
        if limited.is_set():
            return None
        (platform, key), url = item
        result = {"platform": platform, "id": key, "url": url}
        with spacing:
            start = max(scheduled, monotonic())
            scheduled = start + 0.36
        sleep(max(0, start - monotonic()))
        if limited.is_set():
            return None
        try:
            opener = build_opener(SameSiteRedirect())
            target = widget_url(platform, url)
            html, _ = request(opener, target)
            if len(html) > 800_000:
                return {**result, "status": "size-limit"}
            widget = CaptionWidget(platform)
            widget.feed(html.decode("utf-8", errors="replace"))
            result.update(widget.result(url), status="read" if widget.caption else "caption-missing")
        except HTTPError as error:
            result.update(status="http-error", httpStatus=error.code)
            if error.code == 429:
                limited.set()
        except (URLError, OSError, ValueError) as error:
            result.update(status="unavailable", reason=str(error)[:160])
        return result

    with ThreadPoolExecutor(max_workers=4) as workers:
        for item in workers.map(read, pending):
            if item:
                rows[(item["platform"], item["id"])] = item
    stats = Counter(f"{x['platform']} {x['status']}" for x in rows.values())
    output = {"checkedUtc": datetime.now(timezone.utc).isoformat(), "availableLinks": len(pool),
              "limited": limited.is_set(), "counts": dict(stats), "items": list(rows.values())}
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
    print(json.dumps({field: output[field] for field in ("availableLinks", "limited", "counts")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
