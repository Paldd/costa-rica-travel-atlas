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
REGIONS = {"central", "north", "guanacaste", "nicoya", "centralpac", "mountains", "south", "caribbean"}


def read_table(path, fields):
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.reader(file, delimiter="\t", quoting=csv.QUOTE_NONE)
        for line, parts in enumerate(reader, 1):
            if not parts or parts[0].startswith("#"):
                continue
            if len(parts) != len(fields):
                raise ValueError(f"{path.name}:{line} has {len(parts)} cells, expected {len(fields)}")
            yield dict(zip(fields, (x.strip() for x in parts)))


def build_social(sources_by_id):
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
    social["overview"]["facebookPosts"] = len(seen_posts)
    social["overview"]["facebookWithPosts"] = sum(bool(row.get("postLinks")) for row in profiles.values())
    return social


def main():
    sources = list(read_table(DATA / "sources.tsv", SOURCE_FIELDS))
    sources_by_id = {source["id"]: source for source in sources}
    if len(sources_by_id) != len(sources):
        raise ValueError("Duplicate source ID")
    points = {}
    for point in read_table(DATA / "map-points.tsv", POINT_FIELDS):
        key = point.pop("id")
        coords = [float(point.pop(field)) for field in ("lat", "lon")]
        if key in points or point["source"] not in sources_by_id or not (5 <= coords[0] <= 11.3 and -88 <= coords[1] <= -82.3):
            raise ValueError(f"Invalid map point {key}")
        points[key] = {**point, "coords": coords}

    lines = json.loads((DATA / "route-lines.json").read_text())
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
            if any(video not in sources_by_id for video in dossier.get("videos", [])):
                raise ValueError(f"Unknown video source for {key}")
            dossiers[key] = dossier

    records = []
    for path in sorted(DATA.glob("catalog*.tsv")):
        for record in read_table(path, RECORD_FIELDS):
            for key in LIST_FIELDS:
                record[key] = record[key].split(",") if record[key] else []
            record["days"] = float(record["days"])
            record["distance"] = float(record["distance"]) if record["distance"] else None
            records.append(record)
    trips_path = DATA / "expeditions.json"
    if trips_path.exists():
        records.extend(json.loads(trips_path.read_text()))
    social = build_social(sources_by_id)
    social_matches = social.pop("matches")
    metadata = json.loads((DATA / "snapshot.json").read_text())
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
        record["posts"] = social_matches.get(key, [])[:5]
        if dossier := dossiers.get(key):
            record["dossier"] = dossier
    if unknown_checks := checked_by_record.keys() - known_records:
        raise ValueError(f"Unknown records with check dates: {', '.join(sorted(unknown_checks))}")
    if unknown_dossiers := dossiers.keys() - known_records:
        raise ValueError(f"Unknown records with dossiers: {', '.join(sorted(unknown_dossiers))}")
    for record in records:
        for stage in record.get("stages", []):
            for stop in stage.get("stops", []):
                if stop not in known_records or stop == record["id"]:
                    raise ValueError(f"Unknown or circular stop {stop} in {record['id']}")
    out = ROOT / "public" / "atlas.json"
    out.write_text(json.dumps({
        "checked": metadata["checked"], "records": records,
        "sources": sources_by_id, "social": social, "lines": lines,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(records)} records, {len(sources)} sources, {len(social.get('profiles', []))} social profiles")


if __name__ == "__main__":
    main()
