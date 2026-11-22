"""Index an already authorized sample. This script makes no network calls."""

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from urllib.parse import urlsplit

from build_catalog import DATA, read_records


ALIASES = {
    "cocos-sea-hunter-11-liveaboard": ("isla del coco", "cocos island"),
    "murcielago-bat-islands-scuba": ("islas murcielago", "bat islands"),
    "ometepe-san-jorge-ferry": ("ferry a moyogalpa", "san jorge moyogalpa"),
    "ometepe-charco-verde-walk": ("reserva natural charco verde", "charco verde"),

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
    "finca-koki": ("finca koki",),
    "cinchona-soda": ("soda mirador cinchona", "soda y mirador cinchona"),
    "higueron-toro": ("higueron lodge",),
    "catarata-del-toro": ("catarata del toro",),
    "blue-falls-toro": ("blue falls de costa rica", "blue falls of costa rica", "blue falls costa rica"),
    "bajos-toro-weekend": ("bajos del toro con hijas", "vuelta al canon, bajos del toro"),
    "toro-vuelta-canyon": ("catarata vuelta al canon", "catarata vuelta del canon", "vuelta al canon, bajos del toro"),
    "domos-tajo-alto": ("domos mirador glamping", "domos finca el mirador", "domos mirador", "finca el mirador, montes de oro", "@fincaelmirador"),
    "aranjuez-encanto": ("canon rio aranjuez", "canon del rio aranjuez", "canon de aranjuez", "rio aranjuez y cerro"),
    "guiones-samara-carrillo-27": ("guiones carrillo", "guiones a carrillo", "guiones to carrillo"),
    "santa-teresa-nosara-gravel-101": ("santa teresa nosara", "santa teresa a nosara", "santa teresa to nosara"),
    "piedras-blancas": ("parque nacional piedras blancas", "piedras blancas, golfito"),
    "las-catalinas-la-cresta-23": ("la cresta norte",),
    "las-catalinas-secreto-13": ("secreto trail",),
    "catalinas-bike": ("las catalinas mtb", "mountain biking in las catalinas", "pura vida ride"),
    "catalinas-mtb-25": ("pura vida ride 25 km",),
    "catalinas-emtb-12": ("short pura vida ride",),
    "guachipelin": ("hacienda guachipelin", "rio negro hot springs", "aguas termales de rio negro"),
    "catalinas-sup": ("playa danta",),
    "la-paz-waterfalls": ("la paz waterfall gardens",),
    "garza-rosada-low-tide": ("playa cuarzo", "playa rosada de nosara", "playa rosada, nosara"),
    "samara-cocos-beach-camp": ("camping cocos", "los cocos samara"),
    "sardinal-sukka-camper": ("camping sukka",),
    "vara-blanca-donde-lalo-tipis": ("donde lalo tipis", "donde lalo hospedaje"),
}


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFD", value.lower())
                   if not unicodedata.combining(char))


def recurring_names(record):
    native = normalized(record["native"].split("·")[0].strip())
    broad = {"playa", "camping", "costa rica", "arenal", "monteverde", "las catalinas", "hacienda orosi", "discover scuba diving"}
    terms = ALIASES.get(record["id"], ())
    starting_point_only = record["id"] in {"guiones-samara-carrillo-27", "santa-teresa-nosara-gravel-101"}
    if len(native) >= 12 and native not in broad and not starting_point_only:
        terms = (*terms, native)
    return terms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", help="Local JSON with public profile links and a lawfully available post sample")
    config = parser.parse_args()
    with open(config.file, encoding="utf-8") as file:
        sample = json.load(file)
    records = read_records()
    tag_patterns = {
        record["id"]: [re.compile(r"(?<!\w)" + re.escape(term) + r"(?!\w)") for term in recurring_names(record)]
        for record in records
    }
    audit = []
    instagram_codes = set()
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
        instagram_codes.update(unique_posts)
        audit.append({
            "name": row["name"], "platform": platform, "url": profile,
            "posts": len(unique_posts), "about": bool(row["about"]), "checked": row["checked"],
        })
        for code, caption in unique_posts.items():
            for record_id, needles in tag_patterns.items():
                if any(needle.search(caption) for needle in needles):
                    ref = {"profile": row["name"], "url": f"https://www.instagram.com/p/{code}/"}
                    if all(match["url"] != ref["url"] for match in matches[record_id]):
                        matches[record_id].append(ref)
    if len({item["url"] for item in audit}) != len(audit):
        raise ValueError("Duplicate social profile URL")
    report = {
        "overview": {
            "profiles": len(audit),
            "instagramProfiles": sum(row["platform"] == "Instagram" for row in audit),
            "facebookProfiles": sum(row["platform"] == "Facebook" for row in audit),
            "instagramWithPosts": sum(row["posts"] > 0 for row in audit),
            "instagramUniquePosts": len(instagram_codes),
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
