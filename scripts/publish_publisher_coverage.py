"""Validate a successful discovery run before replacing the public source receipt."""

import argparse
import json
from pathlib import Path
import re

from build_catalog import DATA, build_social, read_records, read_sources
from refresh import canonical


RECEIPT = DATA / "publisher-review-coverage.json"
RUN_URL = "https://github.com/Paldd/costa-rica-travel-atlas/actions/runs/"


def run_number(receipt):
    match = re.fullmatch(re.escape(RUN_URL) + r"([1-9][0-9]*)", receipt["runUrl"])
    if not match:
        raise ValueError("The archive receipt must refer to a discovery run in this repository")
    return int(match[1])


def published_pages(receipt):
    return {
        canonical(page["url"])
        for archive in receipt["bySource"].values()
        for page in archive.get("pages", [])
    }


def install_receipt(artifact, expected_run, destination):
    payload = artifact.read_bytes()
    candidate = json.loads(payload)
    current = json.loads(destination.read_bytes())
    if run_number(candidate) != expected_run:
        raise ValueError("The archive receipt does not match this workflow run")
    if expected_run <= run_number(current):
        print("The published receipt is current")
        return
    if candidate["dayUtc"] < current["dayUtc"] or not published_pages(current) <= published_pages(candidate):
        raise ValueError("The archive receipt must retain the published history")

    sources = {row["id"]: row for row in read_sources()}
    records = {row["id"] for row in read_records()}
    aliases = json.loads((DATA / "snapshot.json").read_bytes()).get("recordAliases", {})
    build_social(sources, records, aliases, review_path=artifact)

    pending = destination.with_suffix(".pending")
    pending.write_bytes(payload)
    pending.replace(destination)
    print(f"Validated {candidate['pagesReadToDate']} pages from discovery run {expected_run}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("run", type=int)
    config = parser.parse_args()
    install_receipt(config.artifact, config.run, RECEIPT)


if __name__ == "__main__":
    main()
