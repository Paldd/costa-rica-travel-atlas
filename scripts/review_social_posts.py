"""Compare public post exports with the atlas, without fetching or publishing posts."""

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from build_catalog import DATA, RECORD_FIELDS, read_table
from import_social import normalized, recurring_names


INSTAGRAM_LINK = re.compile(r"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]{7,16})/?$")
PLACE_NAME = re.compile(
    r"\b(?i:cataratas?|finca|cerro|playa|sendero|mirador|laguna|pozas?|río|bahía|reserva|camping|parque nacional)"
    r"\s+(?:(?:de\s+(?:la\s+|los\s+|las\s+)?|del\s+|[Ll]a\s+|[Ll]os\s+|[Ll]as\s+|[Ee]l\s+))?"
    r"[A-ZÁÉÍÓÚÜÑ][\w'’-]+"
    r"(?:\s+(?:(?:de|del)\s+)?[A-ZÁÉÍÓÚÜÑ][\w'’-]+){0,3}"
)
COMMON_NAMES = {"rio celeste", "playa hermosa", "playa negra", "playa blanca", "cerro cruz"}
NAME_BOUNDARIES = {"el", "la", "los", "las", "un", "una", "al", "de", "del", "para", "the", "fechas"}
GENERIC_PLACES = {"reserva natural", "parque nacional", "finca de cacao"}
TOPICS = {
    "rooftent": r"tienda (?:de|en el) techo|(?:roof ?top|roof|car top) tent|rooftoptent|overland(?:ing)?",
    "camping": r"acampar|camping|campamento|glamping|campsite",
    "hiking": r"sendero\w*|senderismo|caminata\w*|hike|hiking|trekking|trail ?running",
    "cycling": r"ciclismo|bicicleta\w*|gravel|mtb|ebike|e-bike|mountain bik\w*",
    "paddle": r"pack ?raft\w*|rafting|kayak\w*|paddle ?board\w*|sup",
    "surf": r"surf\w*",
    "fishing": r"pesca|pescar|fishing",
    "offroad": r"4x4|todo terreno|off[- ]?road\w*",
}
HOSTS = {
    "Instagram": {"instagram.com", "www.instagram.com"},
    "Facebook": {"facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"},
}


def site_url(value, platform):
    if not isinstance(value, str):
        return None
    try:
        url = urlsplit(value)
    except ValueError:
        return None
    if url.scheme == "https" and url.hostname in HOSTS[platform] and not url.username and not url.password:
        return url
    return None


def profile_key(value, platform):
    url = site_url(value, platform)
    if url is None:
        return None
    path = url.path.strip("/").casefold()
    if platform == "Instagram":
        return path.removeprefix("_u/").split("/")[0]
    if path.startswith("people/") and path.rsplit("/", 1)[-1].isdigit():
        return f"profile.php?id={path.rsplit('/', 1)[-1]}"
    if path == "profile.php":
        profile_id = parse_qs(url.query).get("id", [""])[0]
        return f"profile.php?id={profile_id}" if profile_id.isdigit() else None
    return path


def publication(value, platform, post_id=""):
    url = site_url(value, platform)
    if url is None:
        return None
    if platform == "Instagram":
        code = INSTAGRAM_LINK.fullmatch(url.path)
        if code:
            return code[1], f"https://www.instagram.com/p/{code[1]}/"
    elif any(part in url.path for part in ("/posts/", "/reel/", "/videos/")):
        path = url.path.rstrip("/")
        return str(post_id or path), "https://www.facebook.com" + path
    elif url.path in {"/permalink.php", "/story.php", "/photo.php"}:
        params = {key: values[0] for key, values in parse_qs(url.query).items()
                  if key in {"story_fbid", "id", "fbid"}}
        if "story_fbid" in params or "fbid" in params:
            return str(post_id or params.get("story_fbid", params.get("fbid"))), (
                "https://www.facebook.com" + url.path + "?" + urlencode(sorted(params.items()))
            )
    return None


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def publication_date(value):
    try:
        if isinstance(value, str):
            return date.fromisoformat(value[:10]).isoformat()
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return datetime.fromtimestamp(value, tz=timezone.utc).date().isoformat()
    except (ValueError, OverflowError, OSError):
        return None
    return None


def input_rows(paths, platform):
    for path in paths:
        data = read_json(path)
        if not isinstance(data, list):
            raise ValueError(f"Expected a JSON array of dataset items in {path}")
        for item in data:
            if not isinstance(item, dict):
                raise ValueError(f"Expected dataset objects in {path}")
            origins = [item.get("inputUrl"), item.get("pageUrl"), item.get("facebookUrl")]
            if platform == "Instagram" and isinstance(item.get("ownerUsername"), str):
                origins.append("https://www.instagram.com/" + item["ownerUsername"])
            link = item.get("url") or item.get("postUrl")
            text = item.get("caption") if platform == "Instagram" else item.get("text")
            yield origins, link, text, item.get("time") or item.get("timestamp"), item.get("postId"), bool(item.get("error"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", type=Path, help="Local public profile sample used by import_social.py")
    parser.add_argument("--instagram", type=Path, action="append", default=[], help="JSON export from Instagram Post Scraper")
    parser.add_argument("--facebook", type=Path, action="append", default=[], help="JSON export from Facebook Posts Scraper")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not (args.sample or args.instagram or args.facebook):
        parser.error("Supply a source via --sample, --instagram or --facebook")

    profiles = read_json(DATA / "social-coverage.json")["profiles"]
    profile_index = {(p["platform"], profile_key(p["url"], p["platform"])): p["url"] for p in profiles}
    per_profile = {
        p["url"]: {"platform": p["platform"], "posts": set(), "textPosts": set(), "dates": set(), "errors": 0}
        for p in profiles
    }
    posts = {}
    skipped = Counter()

    def add(platform, origins, link, caption, timestamp=None, post_id=None, error=False):
        possible_keys = ((platform, profile_key(origin, platform)) for origin in origins)
        profile = next((profile_index[key] for key in possible_keys if key in profile_index), None)
        if error:
            skipped["providerErrors"] += 1
            if profile:
                per_profile[profile]["errors"] += 1
            return
        resolved = publication(link, platform, post_id)
        if not resolved:
            skipped["withoutDirectPublication"] += 1
            return
        if not profile:
            skipped["withoutRankedProfile"] += 1
            return

        identifier, url = resolved
        key = platform, identifier
        caption = caption.strip() if isinstance(caption, str) else ""
        stats = per_profile[profile]
        stats["posts"].add(key)
        if caption:
            stats["textPosts"].add(key)
        if published := publication_date(timestamp):
            stats["dates"].add(published)
        if key not in posts or len(caption) > len(posts[key]["caption"]):
            posts[key] = {"url": url, "caption": caption, "profile": profile}

    if args.sample:
        for row in read_json(args.sample):
            if row["platform"] == "ig":
                for item in row["posts"]:
                    add("Instagram", [row["profile"]], f'https://www.instagram.com/p/{item["code"]}/', item["text"])
    for platform, paths in (("Instagram", args.instagram), ("Facebook", args.facebook)):
        for row in input_rows(paths, platform):
            add(platform, *row)

    records = [item for path in sorted(DATA.glob("catalog*.tsv")) for item in read_table(path, RECORD_FIELDS)]
    records.extend(read_json(DATA / "expeditions.json"))
    by_name = defaultdict(set)
    for record in records:
        for term in recurring_names(record):
            by_name[term].add(record["id"])
    known_names = {normalized(part.strip()) for record in records for part in record["native"].split("·")}
    patterns = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, sorted(by_name, key=len, reverse=True))) + r")(?!\w)")
    topics = {topic: re.compile(r"\b(?:" + expression + r")\b") for topic, expression in TOPICS.items()}
    posts_by_topic = Counter()
    candidates = {}
    matches = []
    distinct_texts = set()

    for post in posts.values():
        caption = post["caption"]
        if not caption:
            continue
        text = normalized(" ".join(caption.split()))
        distinct_texts.add(text)
        record_ids = set().union(*(by_name[phrase] for phrase in patterns.findall(text)))
        posts_by_topic.update(topic for topic, pattern in topics.items() if pattern.search(text))
        if record_ids:
            matches.append({"url": post["url"], "profile": post["profile"], "cards": sorted(record_ids)})
        for name in {m.group() for m in PLACE_NAME.finditer(caption)}:
            words = name.split()
            while words and normalized(words[-1]) in NAME_BOUNDARIES:
                words.pop()
            if len(words) < 2:
                continue
            name = " ".join(words)
            name_key = normalized(name)
            if name_key in by_name or name_key in known_names or name_key in COMMON_NAMES or name_key in GENERIC_PLACES:
                continue
            item = candidates.setdefault(name_key, {"name": name, "publicationUrls": set(), "count": 0})
            if post["url"] not in item["publicationUrls"]:
                item["count"] += 1
                item["publicationUrls"].add(post["url"])

    result = {
        "uniquePosts": len(posts),
        "withText": sum(bool(post["caption"]) for post in posts.values()),
        "distinctTexts": len(distinct_texts),
        "postsByTopic": dict(sorted(posts_by_topic.items())),
        "skippedRows": dict(skipped),
        "profiles": {
            url: {"platform": stats["platform"], "posts": len(stats["posts"]), "textPosts": len(stats["textPosts"]),
                  "errorRows": stats["errors"],
                  "earliest": min(stats["dates"], default=None), "latest": max(stats["dates"], default=None)}
            for url, stats in per_profile.items()
        },
        "cardMatches": matches,
        "placeCandidates": [
            {"name": item["name"], "publicationCount": item["count"], "publicationUrls": sorted(item["publicationUrls"])[:5]}
            for item in sorted(candidates.values(), key=lambda item: (-item["count"], normalized(item["name"])))
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "uniquePosts": result["uniquePosts"], "withText": result["withText"], "distinctTexts": result["distinctTexts"],
        "profilesWithPosts": sum(bool(p["posts"]) for p in result["profiles"].values()),
        "cardMatches": len(matches), "placeCandidates": len(candidates), "skippedRows": dict(skipped),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
