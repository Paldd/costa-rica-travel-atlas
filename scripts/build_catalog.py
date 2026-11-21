"""Build the public data snapshot from the editorial tables."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_FIELDS = ("id", "kind", "title", "url", "scope")
POST_FIELDS = ("profile", "source")
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

    dossiers = {}
    for path in sorted(DATA.glob("dossiers*.json")):
        for key, dossier in json.loads(path.read_text()).items():
            if key in dossiers:
                raise ValueError(f"Duplicate dossier for {key}")
            dossier["stops"] = [
                {**stop, **points[stop["point"]]} for stop in dossier.get("stops", [])
            ]
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
    social_path = DATA / "social-coverage.json"
    social = json.loads(social_path.read_text()) if social_path.exists() else {}
    social_matches = social.get("matches", {})
    profiles_by_url = {profile["url"]: profile for profile in social.get("profiles", [])}
    manual_posts = list(read_table(DATA / "public-posts.tsv", POST_FIELDS))
    seen_post_sources = set()
    for post in manual_posts:
        profile = profiles_by_url.get(post["profile"])
        source = post["source"]
        if not profile or profile["platform"] != "Facebook" or source not in sources_by_id or source in seen_post_sources:
            raise ValueError(f"Invalid public post entry for {source}")
        profile["posts"] += 1
        seen_post_sources.add(source)
    social.setdefault("overview", {})["facebookPosts"] = len(seen_post_sources)
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
    social.pop("matches", None)
    out = ROOT / "public" / "atlas.json"
    out.write_text(json.dumps({
        "checked": metadata["checked"], "records": records,
        "sources": sources_by_id, "social": social,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(records)} records, {len(sources)} sources, {len(social.get('profiles', []))} social profiles")


if __name__ == "__main__":
    main()
