"""Use the same publisher URL identity for discovery and release validation."""

import re
from urllib.parse import parse_qs, quote, urlencode, urlsplit


def host(url):
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


def encoded_path(path):
    return quote(path, safe="/%:@!$&'()*+,;=")


def package_query(location):
    path = location.path.lower().rstrip("/")
    if host(location.geturl()) != "liriolodge.com" or path not in {"/paquete", "/en/package"}:
        return ""
    # Lirio Lodge publishes distinct programs at the same path.
    package_ids = parse_qs(location.query).get("toursys_package_id", [])
    if len(package_ids) == 1 and re.fullmatch(r"[0-9]+", package_ids[0]):
        return urlencode({"toursys_package_id": package_ids[0]})
    return ""


def canonical(url):
    parsed = urlsplit(url)
    address = host(url) + encoded_path(parsed.path).lower().rstrip("/")
    query = package_query(parsed)
    return address + ("?" + query if query else "")
