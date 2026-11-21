"""Index an already authorized sample. This script makes no network calls."""

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from urllib.parse import urlsplit

from build_catalog import DATA, RECORD_FIELDS, read_table


ALIASES = {
    "sabana-oka": ("sabanas oka", "sabana oka", "sabanas de oka"),
    "chirripo": ("cerro chirripo", "parque nacional chirripo", "chirripo"),
    "marino-ballena": ("marino ballena", "cola de la ballena"),
    "lucha-bike": ("hacienda la lucha",),
    "oikoumene": ("oikoumene",),
    "naranjo-4x4": ("playa naranjo", "roca bruja"),
    "rincon-pailas": ("las pailas",),
    "morpho-azul": ("sendero morpho azul",),
    "pejibaye-pack": ("rio pejibaye", "packraft pejibaye"),
    "monteverde-reserve": ("reserva monteverde", "bosque nuboso monteverde"),
    "tortuguero-canals": ("canales de tortuguero",),
    "cahuita-trail": ("parque nacional cahuita", "punta cahuita"),
    "tamarindo-surf": ("surf en tamarindo", "playa tamarindo"),
    "arenal-paddle": ("lago arenal", "lake arenal"),
    "nauyaca-nature": ("nauyaca waterfall nature park",),
    "nauyaca-don-lulo": ("nauyaca don lulo",),
    "tenorio-celeste": ("rio celeste", "volcan tenorio"),
    "fortuna-falls": ("catarata rio fortuna", "la fortuna waterfall", "catarata la fortuna"),
    "corcovado-sirena": ("sector sirena", "estacion sirena", "sirena corcovado"),
}


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFD", value.lower())
                   if not unicodedata.combining(char))


def recurring_names(record):
    native = normalized(record["native"].split("·")[0].strip())
    broad = {"playa", "camping", "costa rica", "arenal", "monteverde"}
    terms = ALIASES.get(record["id"], ())
    if len(native) >= 12 and native not in broad:
        terms = (*terms, native)
    return set(terms)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", help="Local JSON with public profile links and a lawfully available post sample")
    config = parser.parse_args()
    with open(config.file, encoding="utf-8") as file:
        sample = json.load(file)
    records = [row for path in DATA.glob("catalog*.tsv") for row in read_table(path, RECORD_FIELDS)]
    tag_patterns = {
        record["id"]: [re.compile(r"\b" + re.escape(term) + r"\b") for term in recurring_names(record)]
        for record in records
    }
    audit = []
    matches = defaultdict(list)
    for row in sample:
        profile = row["profile"]
        platform = {"ig": "Instagram", "fb": "Facebook"}[row["platform"]]
        host = (urlsplit(profile).hostname or "").removeprefix("www.")
        if host not in {"instagram.com", "facebook.com"} or not profile.startswith("https://"):
            raise ValueError("Invalid public profile link")
        unique_posts = {
            post["code"]: normalized(post["text"])
            for post in row.get("posts", [])
            if platform == "Instagram" and re.fullmatch(r"[a-zA-Z0-9_-]{7,16}", post.get("code",""))
        }
        audit.append({
            "name": row["name"], "platform": platform, "url": profile,
            "posts": len(unique_posts), "about": bool(row["about"]), "checked": row["checked"],
        })
        for code, caption in unique_posts.items():
            for record_id, needles in tag_patterns.items():
                if any(needle.search(caption) for needle in needles):
                    ref = {"profile": row["name"], "url": f"https://www.instagram.com/p/{code}/"}
                    if ref not in matches[record_id]:
                        matches[record_id].append(ref)
    if len({item["url"] for item in audit}) != len(audit):
        raise ValueError("Duplicate social profile URL")
    report = {
        "overview": {
            "profiles": len(audit),
            "instagramProfiles": sum(row["platform"] == "Instagram" for row in audit),
            "facebookProfiles": sum(row["platform"] == "Facebook" for row in audit),
            "instagramWithPosts": sum(row["posts"] > 0 for row in audit),
            "instagramPosts": sum(row["posts"] for row in audit),
            "facebookAbout": sum(row["platform"] == "Facebook" and row["about"] for row in audit),
            "placesWithPostLinks": len(matches),
        },
        "profiles": audit,
        "matches": dict(matches),
    }
    (DATA / "social-coverage.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["overview"], ensure_ascii=False))


if __name__ == "__main__":
    main()
