"""Build the public data snapshot from the editorial tables."""

import csv
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_FIELDS = ("id", "kind", "title", "url", "scope")
POST_FIELDS = ("profile", "source", "checked")
POST_COPY_FIELDS = ("profile", "source", "count", "first", "last", "checked")
POST_COPY_ITEM_FIELDS = ("profile", "published", "summary", "record")
PUBLISHER_FIELDS = ("profile", "site", "archive", "checked")
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
    for publisher in read_table(DATA / "profile-publishers.tsv", PUBLISHER_FIELDS):
        profile = profiles.get(publisher.pop("profile"))
        site = publisher["site"]
        archive = publisher["archive"]
        if not profile or "publisher" in profile or site not in sources_by_id or (archive and archive not in sources_by_id):
            raise ValueError(f"Invalid publisher link for {site}")
        publisher["checked"] = date.fromisoformat(publisher["checked"]).isoformat()
        profile["publisher"] = publisher
    seen_posts = set()
    for post in read_table(DATA / "public-posts.tsv", POST_FIELDS):
        profile = profiles.get(post["profile"])
        source = sources_by_id.get(post["source"])
        if not profile or profile["platform"] != "Facebook" or not source or source["url"] in seen_posts:
            raise ValueError(f"Invalid public post entry for {post['source']}")
        url = urlsplit(source["url"])
        if url.scheme != "https" or url.hostname not in SOCIAL_DOMAINS["Facebook"] or not any(
            segment in url.path for segment in ("/posts/", "/reel/", "/videos/")
        ):
            raise ValueError(f"Expected a direct Facebook publication for {post['source']}")
        profile["posts"] += 1
        profile.setdefault("postLinks", []).append({
            "source": source["id"], "checked": date.fromisoformat(post["checked"]).isoformat(),
        })
        seen_posts.add(source["url"])
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
    social["overview"]["facebookPosts"] = len(seen_posts)
    social["overview"]["facebookWithPosts"] = sum(bool(row.get("postLinks")) for row in profiles.values())
    social["overview"]["publisherLinks"] = sum("publisher" in row for row in profiles.values())
    social["overview"]["publisherArchiveLinks"] = sum(bool(row.get("publisher", {}).get("archive")) for row in profiles.values())
    return social


def report_sources(record, sources_by_id):
    dossier = record.get("dossier", {})
    references = [
        *record["sources"],
        *dossier.get("galleries", []),
        *(ref for section in dossier.get("sections", []) for ref in section["sources"]),
        *(ref for stage in record.get("stages", []) for ref in stage.get("sources", [])),
    ]
    reports = {}
    for ref in references:
        source = sources_by_id[ref]
        if source["kind"] in {"experience", "track"}:
            reports.setdefault(source["url"].rstrip("/"), ref)
    return list(reports.values())


def main():
    sources = list(read_sources())
    sources_by_id = {source["id"]: source for source in sources}
    if len(sources_by_id) != len(sources):
        raise ValueError("Duplicate source ID")
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
    dossiers = {}
    for path in sorted(DATA.glob("dossiers*.json")):
        for key, dossier in json.loads(path.read_text()).items():
            if key in dossiers:
                raise ValueError(f"Duplicate dossier for {key}")
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
            dossiers[key] = dossier

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
    out = ROOT / "public" / "atlas.json"
    out.write_text(json.dumps({
        "checked": metadata["checked"], "records": records, "recordAliases": aliases,
        "sources": sources_by_id, "social": social, "lines": lines, "guides": guides,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(records)} records, {len(sources)} sources, {len(social.get('profiles', []))} social profiles")


if __name__ == "__main__":
    main()
