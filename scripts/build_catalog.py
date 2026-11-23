"""Build the public data snapshot from the editorial tables."""

import csv
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_FIELDS = ("id", "kind", "title", "url", "scope")
POST_FIELDS = ("profile", "source", "checked", "published")
POST_COPY_FIELDS = ("profile", "source", "count", "first", "last", "checked")
POST_COPY_ITEM_FIELDS = ("profile", "published", "summary", "record")
PUBLISHER_FIELDS = ("profile", "site", "archive", "checked")
PROFILE_CHECK_FIELDS = ("profile", "checked", "status", "detail")
PROFILE_CHECK_STATUSES = {"feed-visible", "grid-visible", "profile-only", "login-required"}
RANK_FIELDS = ("platform", "profile", "rank", "followers", "precision", "checked", "countSource", "category", "zone")
SOCIAL_DOMAINS = {
    "Instagram": {"www.instagram.com"},
    "Facebook": {"www.facebook.com", "web.facebook.com"},
}
POINT_FIELDS = ("id", "name", "lat", "lon", "source")
RECORD_FIELDS = (
    "id", "kind", "region", "title", "native", "level", "days", "activities",
    "audience", "access", "sleep", "sources", "summary", "plan", "conditions", "distance",
)
LIST_FIELDS = ("activities", "audience", "access", "sleep", "sources")
REGIONS = {
    "central", "north", "guanacaste", "nicoya", "centralpac", "mountains", "south", "caribbean",
    "ometepe", "rivas-coast", "chiriqui-coast", "chiriqui-highlands",
}


def read_table(path, fields):
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.reader(file, delimiter="\t", quoting=csv.QUOTE_NONE)
        for line, parts in enumerate(reader, 1):
            if not parts or parts[0].startswith("#"):
                continue
            if len(parts) != len(fields):
                raise ValueError(f"{path.name}:{line} has {len(parts)} cells, expected {len(fields)}")
            yield dict(zip(fields, (x.strip() for x in parts)))


def read_sources():
    for path in (DATA / "sources.tsv", *sorted(DATA.glob("sources-*.tsv"))):
        yield from read_table(path, SOURCE_FIELDS)


def read_records():
    for path in sorted(DATA.glob("catalog*.tsv")):
        for record in read_table(path, RECORD_FIELDS):
            for key in LIST_FIELDS:
                record[key] = record[key].split(",") if record[key] else []
            record["days"] = float(record["days"])
            record["distance"] = float(record["distance"]) if record["distance"] else None
            yield record
    for path in (DATA / "places-abroad.json", DATA / "expeditions.json", *sorted(DATA.glob("expeditions-*.json"))):
        if path.is_file():
            yield from json.loads(path.read_text(encoding="utf-8"))


def build_social(sources_by_id, record_ids, aliases):
    social = json.loads((DATA / "social-coverage.json").read_text())
    profiles = {profile["url"]: profile for profile in social["profiles"]}
    ranks = {platform: set() for platform in SOCIAL_DOMAINS}
    for row in read_table(DATA / "profile-ranking.tsv", RANK_FIELDS):
        profile = profiles[row.pop("profile")]
        platform = row.pop("platform")
        rank = int(row.pop("rank"))
        followers = int(row.pop("followers"))
        checked = row.pop("checked")
        count_source = urlsplit(row["countSource"])
        if (
            platform != profile["platform"] or "rank" in profile or rank in ranks[platform]
            or followers <= 1000 or row["precision"] not in {"exact", "round"}
            or count_source.scheme != "https" or count_source.hostname not in SOCIAL_DOMAINS[platform]
        ):
            raise ValueError(f"Invalid ranking for {profile['url']}")
        profile.update(row, rank=rank, followers=followers, countChecked=date.fromisoformat(checked).isoformat())
        ranks[platform].add(rank)
    if any(values != set(range(1, 101)) for values in ranks.values()) or any("rank" not in row for row in profiles.values()):
        raise ValueError("Incomplete scope of the social rankings")
    social["profiles"].sort(key=lambda row: (row["platform"] != "Instagram", row["rank"]))
    for receipt in read_table(DATA / "profile-browser-checks.tsv", PROFILE_CHECK_FIELDS):
        profile_url = receipt.pop("profile")
        profile = profiles.get(profile_url)
        if (not profile or "liveCheck" in profile or not receipt["detail"]
                or receipt["status"] not in PROFILE_CHECK_STATUSES):
            raise ValueError(f"Invalid browser check for {profile_url}")
        receipt["checked"] = date.fromisoformat(receipt["checked"]).isoformat()
        profile["liveCheck"] = receipt
    for publisher in read_table(DATA / "profile-publishers.tsv", PUBLISHER_FIELDS):
        profile = profiles.get(publisher.pop("profile"))
        site = publisher["site"]
        archive = publisher["archive"]
        if not profile or "publisher" in profile or site not in sources_by_id or (archive and archive not in sources_by_id):
            raise ValueError(f"Invalid publisher link for {site}")
        publisher["checked"] = date.fromisoformat(publisher["checked"]).isoformat()
        profile["publisher"] = publisher
    review_path = DATA / "publisher-review-coverage.json"
    if review_path.exists():
        review = json.loads(review_path.read_text(encoding="utf-8"))
        archives = review.pop("bySource")
        run = urlsplit(review["runUrl"])
        if (
            run.scheme != "https" or run.hostname != "github.com"
            or not run.path.startswith("/Paldd/costa-rica-travel-atlas/actions/runs/")
            or not (0 <= review["pagesRead"] <= review["pagesChecked"])
            or review["pagesReadToDate"] < review["pagesRead"]
            or not (0 <= review["archivesRead"] <= review["archives"])
        ):
            raise ValueError("Invalid publisher archive review receipt")
        review["dayUtc"] = date.fromisoformat(review["dayUtc"]).isoformat()
        history = review.get("history") is True
        pages_seen = set()
        pages_in_run = 0
        for source, coverage in archives.items():
            read, indexed = coverage["read"], coverage["indexed"]
            pages = coverage.get("pages", [])
            indexed_counts = isinstance(read, int) and isinstance(indexed, int) and 0 <= read <= indexed
            past_archive = history and read is None and indexed is None and bool(pages)
            if source not in sources_by_id or not (indexed_counts or past_archive):
                raise ValueError(f"Invalid publisher archive coverage for {source}")
            if not history and len(pages) > read:
                raise ValueError(f"Invalid displayed archive pages for {source}")
            archive_host = urlsplit(sources_by_id[source]["url"]).hostname.removeprefix("www.")
            for page in pages:
                url = urlsplit(page["url"])
                page_key = archive_host + url.path.lower().rstrip("/")
                if (
                    url.scheme != "https" or url.username or url.password or not url.hostname
                    or url.hostname.removeprefix("www.") != archive_host or not page["title"].strip()
                    or page_key in pages_seen
                ):
                    raise ValueError(f"Invalid read page for {source}: {page['url']}")
                pages_seen.add(page_key)
                if page.get("published"):
                    page["published"] = date.fromisoformat(page["published"]).isoformat()
                if history:
                    page["checked"] = date.fromisoformat(page["checked"]).isoformat()
                    if page["checked"] > review["dayUtc"] or not isinstance(page.get("readThisRun", False), bool):
                        raise ValueError(f"Invalid verification date for {source}: {page['url']}")
                    pages_in_run += page.get("readThisRun", False)
        if history and (len(pages_seen) != review["pagesReadToDate"] or pages_in_run != review["pagesRead"]):
            raise ValueError("The publisher coverage counts do not match the listed articles")
        linked_archives = set()
        for profile in profiles.values():
            publisher = profile.get("publisher")
            if publisher and publisher["archive"] in archives:
                publisher["coverage"] = archives[publisher["archive"]]
                linked_archives.add(publisher["archive"])
        review["guidePages"] = {
            source: coverage["pages"] for source, coverage in archives.items()
            if coverage.get("pages") and source not in linked_archives
        }
        social["publisherReview"] = review
    seen_posts = set()
    for post in read_table(DATA / "public-posts.tsv", POST_FIELDS):
        profile = profiles.get(post["profile"])
        source = sources_by_id.get(post["source"])
        if not profile or not source:
            raise ValueError(f"Invalid public post entry for {post['source']}")
        platform = profile["platform"]
        url = urlsplit(source["url"])
        path = url.path.rstrip("/")
        parts = path.strip("/").split("/")
        if platform == "Instagram":
            owner = urlsplit(profile["url"]).path.strip("/")
            valid_path = len(parts) in {2, 3} and parts[-2] in {"p", "reel"} and (
                len(parts) == 2 or parts[0].lower() == owner.lower()
            )
        else:
            valid_path = len(parts) >= 2 and parts[-2] in {"posts", "reel", "videos"}
        # Facebook can present the same video under either /videos/ or /reel/.
        key = (platform, parts[-1])
        if url.scheme != "https" or url.hostname not in SOCIAL_DOMAINS[platform] or not valid_path or key in seen_posts:
            raise ValueError(f"Expected a distinct direct {platform} publication for {post['source']}")
        checked = date.fromisoformat(post["checked"])
        link = {"source": source["id"], "checked": checked.isoformat()}
        if post["published"]:
            published = date.fromisoformat(post["published"])
            if published > checked:
                raise ValueError(f"Publication date after check for {source['id']}")
            link["published"] = published.isoformat()
        if platform == "Facebook":
            profile["posts"] += 1
        profile.setdefault("postLinks", []).append(link)
        seen_posts.add(key)
    for profile in profiles.values():
        links = profile.get("postLinks", [])
        links.sort(key=lambda link: link.get("published", ""), reverse=True)
        dated = [link["published"] for link in links if "published" in link]
        if dated:
            profile["postPeriod"] = {"first": dated[-1], "last": dated[0]}
    copy_total = 0
    for sample in read_table(DATA / "public-post-copies.tsv", POST_COPY_FIELDS):
        profile = profiles.get(sample.pop("profile"))
        source = sources_by_id.get(sample["source"])
        if not profile or profile["platform"] != "Facebook" or "copySample" in profile or not source:
            raise ValueError(f"Invalid public copy sample for {sample['source']}")
        url = urlsplit(source["url"])
        first, last, checked = (date.fromisoformat(sample[key]) for key in ("first", "last", "checked"))
        count = int(sample["count"])
        if url.scheme != "https" or url.hostname in SOCIAL_DOMAINS["Facebook"] or not (0 < count and first <= last <= checked):
            raise ValueError(f"Invalid public copy period or source for {sample['source']}")
        profile["copySample"] = {**sample, "count": count}
        copy_total += count
    seen_copy_items = set()
    copy_items_path = DATA / "public-post-copy-items.tsv"
    copy_items = read_table(copy_items_path, POST_COPY_ITEM_FIELDS) if copy_items_path.exists() else ()
    for item in copy_items:
        profile = profiles.get(item.pop("profile"))
        sample = profile.get("copySample") if profile else None
        published = date.fromisoformat(item["published"]).isoformat()
        record = aliases.get(item["record"], item["record"])
        key = (profile["url"] if profile else "", published, item["summary"])
        if (
            not sample or not (sample["first"] <= published <= sample["last"])
            or not item["summary"] or key in seen_copy_items
            or (record and record not in record_ids)
        ):
            raise ValueError(f"Invalid public copy item: {key}")
        seen_copy_items.add(key)
        sample.setdefault("items", []).append({**item, "published": published, "record": record})
    for profile in profiles.values():
        sample = profile.get("copySample")
        if not sample or not sample.get("items"):
            continue
        items = sample["items"]
        items.sort(key=lambda item: item["published"], reverse=True)
        if (
            len(items) != sample["count"]
            or items[0]["published"] != sample["last"]
            or items[-1]["published"] != sample["first"]
        ):
            raise ValueError(f"Copy items do not match the sample for {profile['url']}")
    social["overview"]["facebookCopiedPosts"] = copy_total
    social["overview"]["facebookWithCopies"] = sum("copySample" in row for row in profiles.values())
    social["overview"]["facebookPosts"] = sum(platform == "Facebook" for platform, _ in seen_posts)
    social["overview"]["facebookWithPosts"] = sum(
        row["platform"] == "Facebook" and bool(row.get("postLinks")) for row in profiles.values()
    )
    social["overview"]["instagramOpenedPosts"] = sum(platform == "Instagram" for platform, _ in seen_posts)
    social["overview"]["instagramWithOpenedPosts"] = sum(
        row["platform"] == "Instagram" and bool(row.get("postLinks")) for row in profiles.values()
    )
    social["overview"]["instagramWithMultipleOpenedPosts"] = sum(
        row["platform"] == "Instagram" and len(row.get("postLinks", [])) > 1 for row in profiles.values()
    )
    social["overview"]["publisherLinks"] = sum("publisher" in row for row in profiles.values())
    social["overview"]["publisherArchiveLinks"] = sum(bool(row.get("publisher", {}).get("archive")) for row in profiles.values())
    social["overview"]["browserChecks"] = sum("liveCheck" in row for row in profiles.values())
    social["overview"]["visibleBrowserFeeds"] = sum(
        row.get("liveCheck", {}).get("status") == "feed-visible" for row in profiles.values()
    )
    return social


def report_sources(record, sources_by_id):
    dossier = record.get("dossier", {})
    references = [
        *record["sources"],
        *dossier.get("galleries", []),
        *dossier.get("accessNotice", {}).get("sources", []),
        *(ref for section in dossier.get("sections", []) for ref in section["sources"]),
        *(ref for stage in record.get("stages", []) for ref in stage.get("sources", [])),
    ]
    reports = {}
    for ref in references:
        source = sources_by_id[ref]
        if source["kind"] in {"experience", "track"}:
            reports.setdefault(source["url"].rstrip("/"), ref)
    return list(reports.values())


def video_source(source):
    if source["kind"] == "video":
        return True
    url = urlsplit(source["url"])
    host = (url.hostname or "").removeprefix("www.").removeprefix("m.")
    if host == "instagram.com":
        return bool(re.fullmatch(r"/reels?/[\w-]+/?", url.path))
    if host == "facebook.com":
        return bool(re.fullmatch(r"/(?:reel/|[^/]+/videos/)\d+/?", url.path))
    return host in {"youtube.com", "youtu.be"} and (
        url.path == "/watch" and "v=" in url.query
        or bool(re.fullmatch(r"/(?:shorts/|live/)?[\w-]{11}/?", url.path))
    )


def external_route_kind(source, route_maps):
    if source["id"] in route_maps:
        return "map"
    url = urlsplit(source["url"])
    host = (url.hostname or "").removeprefix("www.")
    path = url.path
    if source["kind"] == "track" or re.search(r"(?:\.gpx|/gpx/\d+)/?$", path, re.IGNORECASE):
        return "track"
    if host == "wikiloc.com" or host.endswith(".wikiloc.com"):
        if re.fullmatch(r"/[^/]+/[^/]+-\d+/?", path):
            return "track"
    if host == "trailforks.com" and path.startswith("/region/"):
        return "map"
    track_platforms = {
        "ridewithgps.com": r"/routes/\d+/?",
        "mtbproject.com": r"/trail/\d+(?:/[^/]+)?/?",
        "komoot.com": r"/(?:[a-z]{2}-[a-z]{2}/)?(?:smarttour|tour)/\d+(?:/[^/]+)?/?",
        "trailforks.com": r"/(?:route|trails)/[^/]+/?",
        "connect.garmin.com": r"/(?:app|modern)/course/\d+/?",
    }
    if host in track_platforms and re.fullmatch(track_platforms[host], path):
        return "track"
    return None


def reusable_media(record, sources, gallery_ids):
    dossier = record["dossier"]
    references = [
        *record["sources"],
        *(ref for section in dossier.get("sections", []) for ref in section["sources"]),
    ]
    additions = {
        "galleries": (ref for ref in references if ref in gallery_ids or sources[ref]["kind"] == "gallery"),
        "videos": (ref for ref in references if video_source(sources[ref])),
    }
    for field, ids in additions.items():
        existing = dossier.get(field, [])
        known_urls = {sources[ref]["url"].rstrip("/") for ref in existing}
        # Keep editorial choices first. Additional media already has a source on this card.
        for ref in ids:
            url = sources[ref]["url"].rstrip("/")
            if url not in known_urls:
                existing.append(ref)
                known_urls.add(url)
        if existing:
            dossier[field] = existing
    if dossier.get("galleries") and dossier.get("videos"):
        video_urls = {sources[ref]["url"].rstrip("/") for ref in dossier["videos"] if video_source(sources[ref])}
        dossier["galleries"] = [
            ref for ref in dossier["galleries"] if sources[ref]["url"].rstrip("/") not in video_urls
        ]


def attach_stop_media(records, dossiers):
    # A place can illustrate a mapped stop when both dossiers use the same waypoint.
    # At a shared meeting point, only reuse a photo if the candidate place is unambiguous.
    places_by_point = {}
    for row in records:
        dossier = dossiers.get(row["id"], {})
        if row["kind"] == "place" and dossier.get("photos") and dossier.get("stops"):
            places_by_point.setdefault(dossier["stops"][0]["point"], []).append(row["id"])
    for row in records:
        dossier = dossiers.get(row["id"])
        if not dossier:
            continue
        stops = dossier["stops"]
        linked = [stop for stage in row.get("stages", []) for stop in stage["stops"]]
        if row["kind"] != "place" and not row.get("stages") and len(stops) > 1:
            nearby = set(dossier.get("nearby", []))
            for stop in stops:
                places = [key for key in places_by_point.get(stop["point"], []) if key in nearby]
                if len(places) == 1:
                    linked.extend(places)
        linked = [
            key for key in dict.fromkeys(linked)
            if any(dossiers.get(key, {}).get(field) for field in ("photos", "galleries", "videos"))
        ]
        if linked:
            dossier["mediaStops"] = linked
        if not dossier.get("photos"):
            for stop in linked:
                if photo := next(iter(dossiers[stop].get("photos", [])), None):
                    dossier["stageCover"] = {**photo, "caption": f"Остановка · {photo['caption']}", "record": stop}
                    break


def main():
    sources = list(read_sources())
    sources_by_id = {source["id"]: source for source in sources}
    if len(sources_by_id) != len(sources):
        raise ValueError("Duplicate source ID")
    map_refs = json.loads((DATA / "route-map-sources.json").read_text(encoding="utf-8"))
    route_maps = set(map_refs)
    if len(route_maps) != len(map_refs) or not route_maps <= sources_by_id.keys():
        raise ValueError("Unknown or repeated external route map")
    points = {}
    for point in read_table(DATA / "map-points.tsv", POINT_FIELDS):
        key = point.pop("id")
        coords = [float(point.pop(field)) for field in ("lat", "lon")]
        if key in points or point["source"] not in sources_by_id or not (5 <= coords[0] <= 15.1 and -88 <= coords[1] <= -77):
            raise ValueError(f"Invalid map point {key}")
        points[key] = {**point, "coords": coords}

    lines = {}
    for path in sorted(DATA.glob("route-lines*.json")):
        entries = json.loads(path.read_text(encoding="utf-8"))
        if overlap := lines.keys() & entries.keys():
            raise ValueError(f"Duplicate route geometry: {', '.join(sorted(overlap))}")
        lines.update(entries)
    photos = json.loads((DATA / "photos.json").read_text())
    for key, photo in photos.items():
        file = photo.get("file", "")
        if (
            not isinstance(file, str) or Path(file).name != file
            or not (ROOT / "public" / "photos" / file).is_file()
            or any(not photo.get(field) for field in ("alt", "caption", "author", "license"))
            or any(urlsplit(photo.get(field, "")).scheme != "https" for field in ("original", "licenseUrl"))
        ):
            raise ValueError(f"Missing image or photo credit for {key}")
    media_path = DATA / "card-media.json"
    media_edits = json.loads(media_path.read_text(encoding="utf-8")) if media_path.exists() else {}
    dossiers = {}
    for path in sorted(DATA.glob("dossiers*.json")):
        for key, dossier in json.loads(path.read_text()).items():
            if key in dossiers:
                raise ValueError(f"Duplicate dossier for {key}")
            if "accessNotice" in dossier:
                access = dossier["accessNotice"]
                if not (access["title"].strip() and access["text"].strip() and access["sources"]
                        and all(ref in sources_by_id for ref in access["sources"])):
                    raise ValueError(f"Invalid access notice for {key}")
            for field, refs in media_edits.get(key, {}).items():
                if field not in {"photos", "videos", "galleries"} or not isinstance(refs, list):
                    raise ValueError(f"Invalid media field for {key}: {field}")
                dossier[field] = list(dict.fromkeys([*dossier.get(field, []), *refs]))
            dossier["stops"] = [
                {**stop, **points[stop["point"]]} for stop in dossier.get("stops", [])
            ]
            if "photos" in dossier:
                photo_ids = dossier["photos"]
                if len(photo_ids) != len(set(photo_ids)) or any(photo not in photos for photo in photo_ids):
                    raise ValueError(f"Unknown or repeated photo for {key}")
                dossier["photos"] = [photos[photo] for photo in photo_ids]
            for field in ("videos", "galleries"):
                media = dossier.get(field, [])
                if len(media) != len(set(media)) or any(source not in sources_by_id for source in media):
                    raise ValueError(f"Unknown or repeated {field} source for {key}")
            if track := dossier.get("track"):
                if kind := external_route_kind(sources_by_id[track], route_maps):
                    dossier["trackKind"] = kind
            dossiers[key] = dossier
    if unknown_media := media_edits.keys() - dossiers.keys():
        raise ValueError(f"Media for unknown dossiers: {', '.join(sorted(unknown_media))}")
    gallery_ids = {ref for dossier in dossiers.values() for ref in dossier.get("galleries", [])}

    records = list(read_records())
    guides = [
        {key: feed[key] for key in ("name", "url", "language", "focus")}
        for feed in json.loads((DATA / "feeds.json").read_text()) if "language" in feed
    ]
    metadata = json.loads((DATA / "snapshot.json").read_text())
    aliases = metadata.get("recordAliases", {})
    record_ids = {row["id"] for row in records}
    if any(legacy in record_ids or target not in record_ids for legacy, target in aliases.items()):
        raise ValueError("Record aliases must point directly to an existing different record")
    social = build_social(sources_by_id, record_ids, aliases)
    social_matches = social.pop("matches")
    for legacy, target in aliases.items():
        if posts := social_matches.get(legacy):
            current = social_matches.setdefault(target, [])
            current.extend(post for post in posts if post not in current)
    check_path = DATA / "checks.tsv"
    checked_by_record = {
        check["id"]: check["checked"]
        for check in read_table(check_path, ("id", "checked"))
    } if check_path.exists() else {}
    known_records = set()
    for record in records:
        key = record["id"]
        if key in known_records or record["region"] not in REGIONS:
            raise ValueError(f"Invalid ID or region for {key}")
        known_records.add(key)
        if not record["sources"] or any(src not in sources_by_id for src in record["sources"]):
            raise ValueError(f"Unknown or missing source for {key}")
        record["checked"] = checked_by_record.get(key, metadata["checked"])
        record["posts"] = social_matches.get(key, [])
        if dossier := dossiers.get(key):
            if "nearby" in dossier:
                dossier["nearby"] = [aliases.get(link, link) for link in dossier["nearby"]]
            record["dossier"] = dossier
            reusable_media(record, sources_by_id, gallery_ids)
        if reports := report_sources(record, sources_by_id):
            record["reportSources"] = reports
    if unknown_checks := checked_by_record.keys() - known_records:
        raise ValueError(f"Unknown records with check dates: {', '.join(sorted(unknown_checks))}")
    if unknown_dossiers := dossiers.keys() - known_records:
        raise ValueError(f"Unknown records with dossiers: {', '.join(sorted(unknown_dossiers))}")
    for record in records:
        for stage in record.get("stages", []):
            stage["stops"] = [aliases.get(stop, stop) for stop in stage["stops"]]
            for stop in stage["stops"]:
                if stop not in known_records or stop == record["id"]:
                    raise ValueError(f"Unknown or circular stop {stop} in {record['id']}")
    attach_stop_media(records, dossiers)
    out = ROOT / "public" / "atlas.json"
    out.write_text(json.dumps({
        "checked": metadata["checked"], "records": records, "recordAliases": aliases,
        "sources": sources_by_id, "social": social, "lines": lines, "guides": guides,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(records)} records, {len(sources)} sources, {len(social.get('profiles', []))} social profiles")


if __name__ == "__main__":
    main()
