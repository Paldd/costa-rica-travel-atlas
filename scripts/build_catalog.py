"""Build the public data snapshot from the editorial tables."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_FIELDS = ("id", "kind", "title", "url", "scope")
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
    metadata = json.loads((DATA / "snapshot.json").read_text())
    known_records = set()
    for record in records:
        key = record["id"]
        if key in known_records or record["region"] not in REGIONS:
            raise ValueError(f"Invalid ID or region for {key}")
        known_records.add(key)
        if not record["sources"] or any(src not in sources_by_id for src in record["sources"]):
            raise ValueError(f"Unknown or missing source for {key}")
        record["checked"] = metadata["checked"]
        record["posts"] = social_matches.get(key, [])[:5]
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
