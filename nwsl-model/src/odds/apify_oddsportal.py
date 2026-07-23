"""Apify/OddsPortal historical NWSL odds import helpers."""

from __future__ import annotations

import base64
import gzip
import html
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from src.data.team_names import canonicalize_team_name, normalize_team_key
from src.odds.apify_footystats import ODDS_CONTRACT_COLUMNS, run_apify_web_scraper

UTC = timezone.utc

ODDSPORTAL_NWSL_RESULTS_URLS: dict[int, str] = {
    2025: "https://www.oddsportal.com/football/usa/nwsl-women-2025/results/",
    2026: "https://www.oddsportal.com/football/usa/nwsl-women/results/",
}

ODDSPORTAL_PASSWORD = b"J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k"
ODDSPORTAL_SALT = b"5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d"
ODDSPORTAL_MATCH_EVENT_BOOKIEHASH = "yja83"

ODDSPORTAL_TEAM_ALIASES = {
    "angel city": "Angel City FC",
    "angel city fc": "Angel City FC",
    "bay fc": "Bay FC",
    "boston legacy": "Boston Legacy",
    "boston legacy fc": "Boston Legacy",
    "chicago": "Chicago Stars",
    "chicago red stars": "Chicago Stars",
    "chicago stars": "Chicago Stars",
    "denver summit": "Denver Summit FC",
    "denver summit fc": "Denver Summit FC",
    "gotham": "Gotham FC",
    "gotham fc": "Gotham FC",
    "houston dash": "Houston Dash",
    "kansas city current": "Current",
    "north carolina courage": "NC Courage",
    "nc courage": "NC Courage",
    "orlando pride": "Orlando Pride",
    "portland thorns": "Portland Thorns",
    "portland thorns fc": "Portland Thorns",
    "racing louisville": "Racing Louisville",
    "racing louisville fc": "Racing Louisville",
    "san diego wave": "SD Wave",
    "san diego wave fc": "SD Wave",
    "seattle reign": "Reign",
    "seattle reign fc": "Reign",
    "utah royals": "Royals",
    "washington spirit": "Washington Spirit",
}


@dataclass(frozen=True)
class OddsPortalSeasonRequest:
    """Resolved OddsPortal archive request details for one season."""

    season: int
    source_url: str
    archive_url: str
    url_part_tz: int
    url_part_qs: str
    bookiehash: str
    use_premium: int

    def page_url(self, page: int, cache_bust: int | None = None) -> str:
        if page < 1:
            raise ValueError("page must be >= 1")
        page_part = "" if page == 1 else f"page/{page}/"
        stamp = cache_bust if cache_bust is not None else int(time.time() * 1000)
        return (
            f"https://www.oddsportal.com{self.archive_url}"
            f"{self.bookiehash}/{self.use_premium}/{self.url_part_tz}/{page_part}"
            f"{self.url_part_qs}{stamp}"
        )


def build_discovery_input(urls: list[str]) -> dict[str, Any]:
    """Build an Apify Web Scraper input that extracts OddsPortal archive metadata."""
    page_function = r"""
async function pageFunction(context) {
  await context.waitFor(8000);
  const html = document.documentElement ? document.documentElement.outerHTML : '';
  const nextMatches = document.querySelector('next-matches');
  const oddsRequestAttr = nextMatches ? nextMatches.getAttribute(':odds-request') : null;
  const ajaxUserDataSrc = Array.from(document.querySelectorAll('script[src]'))
    .map((script) => script.src)
    .find((src) => src.includes('/ajax-user-data/')) || null;
  const pageOutrights =
    typeof pageOutrightsVar !== 'undefined' ? String(pageOutrightsVar) : null;
  return {
    url: context.request.url,
    title: document.title,
    oddsRequestAttr,
    ajaxUserDataSrc,
    pageOutrights,
    htmlSample: html.slice(0, 600000)
  };
}
"""
    return {
        "startUrls": [{"url": url} for url in urls],
        "linkSelector": "",
        "pageFunction": page_function,
        "proxyConfiguration": {"useApifyProxy": True},
        "maxRequestsPerCrawl": len(urls),
        "maxRequestRetries": 1,
        "pageLoadTimeoutSecs": 120,
        "runMode": "PRODUCTION",
    }


def build_archive_fetch_input(urls: list[dict[str, Any]]) -> dict[str, Any]:
    """Build an Apify Web Scraper input that fetches encrypted archive pages."""
    page_function = r"""
async function pageFunction(context) {
  await context.waitFor(1000);
  return {
    url: context.request.url,
    userData: context.request.userData,
    title: document.title,
    text: document.body ? document.body.innerText.trim() : ''
  };
}
"""
    return {
        "startUrls": urls,
        "linkSelector": "",
        "pageFunction": page_function,
        "proxyConfiguration": {"useApifyProxy": True},
        "maxRequestsPerCrawl": len(urls),
        "maxRequestRetries": 1,
        "pageLoadTimeoutSecs": 90,
        "runMode": "PRODUCTION",
    }


def build_match_event_fetch_input(urls: list[dict[str, Any]]) -> dict[str, Any]:
    """Build an Apify Web Scraper input that fetches encrypted event-market pages."""
    page_function = r"""
async function pageFunction(context) {
  await context.waitFor(100);
  return {
    url: context.request.url,
    userData: context.request.userData,
    title: document.title,
    text: document.body ? document.body.innerText.trim() : ''
  };
}
"""
    return {
        "startUrls": urls,
        "linkSelector": "",
        "pageFunction": page_function,
        "proxyConfiguration": {"useApifyProxy": True},
        "maxRequestsPerCrawl": len(urls),
        "maxRequestRetries": 1,
        "pageLoadTimeoutSecs": 60,
        "runMode": "PRODUCTION",
    }


def _json_from_escaped_attr(value: str) -> dict[str, Any]:
    return json.loads(html.unescape(value).strip())


def _extract_odds_request(item: dict[str, Any]) -> dict[str, Any]:
    attr = item.get("oddsRequestAttr")
    if isinstance(attr, str) and attr.strip():
        return _json_from_escaped_attr(attr)

    sample = str(item.get("htmlSample") or "")
    match = re.search(r':odds-request="([^"]+)"', sample)
    if match:
        return _json_from_escaped_attr(match.group(1))
    outright_match = re.search(r"pageOutrightsVar\s*=\s*'([^']+)'", sample)
    if outright_match:
        outright = json.loads(html.unescape(outright_match.group(1)))
        sport_id = int(outright.get("sid", 1))
        tournament_id = str(outright["id"])
        return {
            "url": f"/ajax-sport-country-tournament-archive_/{sport_id}/{tournament_id}/",
            "urlPartTz": 0,
            "urlPartQs": "?_=",
        }
    raise ValueError(f"Could not resolve OddsPortal odds request for {item.get('url')}")


def _extract_ajax_user_data_url(item: dict[str, Any]) -> str:
    src = item.get("ajaxUserDataSrc")
    if isinstance(src, str) and src.strip():
        return src

    sample = str(item.get("htmlSample") or "")
    match = re.search(r'<script[^>]+src="([^"]*/ajax-user-data/[^"]+)"', sample)
    if not match:
        raise ValueError(f"Could not resolve OddsPortal user-data URL for {item.get('url')}")
    src = html.unescape(match.group(1))
    if src.startswith("//"):
        return f"https:{src}"
    if src.startswith("/"):
        return f"https://www.oddsportal.com{src}"
    return src


def _parse_user_data_script(script_text: str) -> dict[str, Any]:
    match = re.search(r'Object\.assign\(pageVar,\s*JSON\.parse\("(.*)"\)\)', script_text, re.S)
    if not match:
        raise ValueError("Could not parse OddsPortal user-data script.")
    return json.loads(json.loads(f'"{match.group(1)}"'))


def fetch_user_data_config(user_data_url: str) -> dict[str, Any]:
    """Fetch the OddsPortal user-data script and return the embedded config."""
    request = Request(
        user_data_url,
        headers={
            "Accept": "application/javascript,text/html,*/*",
            "User-Agent": "nwsl-model/0.1",
        },
    )
    with urlopen(request, timeout=90) as response:
        script_text = response.read().decode("utf-8", errors="replace")
    return _parse_user_data_script(script_text)


def resolve_season_requests(
    discovery_items: list[dict[str, Any]],
    seasons: list[int],
    season_urls: dict[int, str],
) -> list[OddsPortalSeasonRequest]:
    """Resolve season-specific archive endpoint metadata from Apify discovery output."""
    by_url = {str(item.get("url")): item for item in discovery_items}
    requests: list[OddsPortalSeasonRequest] = []
    for season in seasons:
        source_url = season_urls[season]
        item = by_url.get(source_url)
        if item is None:
            candidates = [
                entry
                for entry in discovery_items
                if str(entry.get("url", "")).rstrip("/") == source_url.rstrip("/")
            ]
            item = candidates[0] if candidates else None
        if item is None:
            raise ValueError(f"Apify discovery did not return {source_url}")

        odds_request = _extract_odds_request(item)
        user_config = fetch_user_data_config(_extract_ajax_user_data_url(item))
        requests.append(
            OddsPortalSeasonRequest(
                season=season,
                source_url=source_url,
                archive_url=str(odds_request["url"]).replace("\\/", "/"),
                url_part_tz=int(odds_request.get("urlPartTz", 0)),
                url_part_qs=str(odds_request.get("urlPartQs", "?_=")),
                bookiehash=str(user_config["bookiehash"]),
                use_premium=int(user_config["usePremium"]),
            )
        )
    return requests


def decrypt_archive_payload(encrypted_text: str) -> dict[str, Any]:
    """Decrypt an OddsPortal archive AJAX payload."""
    decoded = base64.b64decode(encrypted_text.strip()).decode("utf-8")
    encrypted_body, iv_hex = decoded.split(":", 1)
    ciphertext = base64.b64decode(encrypted_body)
    iv = bytes.fromhex(iv_hex)
    key = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=ODDSPORTAL_SALT,
        iterations=1000,
    ).derive(ODDSPORTAL_PASSWORD)
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    try:
        unpadder = padding.PKCS7(128).unpadder()
        plaintext = unpadder.update(padded) + unpadder.finalize()
    except ValueError:
        plaintext = padded
    if plaintext.startswith(b"\x1f\x8b"):
        plaintext = gzip.decompress(plaintext)
    return json.loads(plaintext.decode("utf-8"))


def decrypt_archive_items(items: list[dict[str, Any]]) -> dict[int, dict[int, dict[str, Any]]]:
    """Decrypt archive pages returned by Apify direct AJAX fetches."""
    output: dict[int, dict[int, dict[str, Any]]] = {}
    for item in items:
        user_data = item.get("userData") if isinstance(item.get("userData"), dict) else {}
        season = int(user_data.get("season"))
        page = int(user_data.get("page"))
        text = str(item.get("text") or "").strip()
        if not text:
            raise ValueError(f"Apify returned empty archive payload for season={season} page={page}")
        output.setdefault(season, {})[page] = decrypt_archive_payload(text)
    return output


def _direct_encrypted_item(url: str, user_data: dict[str, Any], timeout_seconds: int = 60) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://www.oddsportal.com/",
            "User-Agent": "nwsl-model/0.1",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            text = response.read().decode("utf-8", errors="replace")
        return {
            "url": url,
            "userData": user_data,
            "title": "",
            "text": text,
        }
    except (HTTPError, URLError, TimeoutError) as exc:
        return {
            "#error": True,
            "url": url,
            "userData": user_data,
            "error": str(exc),
        }


def _archive_payload_has_rows(item: dict[str, Any]) -> bool:
    text = str(item.get("text") or "").strip()
    if not text:
        return False
    try:
        payload = decrypt_archive_payload(text)
    except Exception:
        return False
    rows = payload.get("d", {}).get("rows", [])
    return isinstance(rows, list) and len(rows) > 0


def repair_empty_archive_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Refetch empty Apify archive pages directly when OddsPortal returned null rows."""
    repaired: list[dict[str, Any]] = []
    for item in items:
        if _archive_payload_has_rows(item):
            repaired.append(item)
            continue
        url = str(item.get("url", "") or "")
        user_data = item.get("userData") if isinstance(item.get("userData"), dict) else {}
        if not url:
            repaired.append(item)
            continue
        direct_item = _direct_encrypted_item(url, user_data)
        repaired.append(direct_item if _archive_payload_has_rows(direct_item) else item)
    return repaired


def decrypt_match_event_items(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Decrypt event-market payloads keyed by OddsPortal encoded event ID."""
    output: dict[str, dict[str, Any]] = {}
    for item in items:
        user_data = item.get("userData") if isinstance(item.get("userData"), dict) else {}
        encoded_event_id = str(user_data.get("encoded_event_id", "")).strip()
        text = str(item.get("text") or "").strip()
        if not encoded_event_id or not text:
            continue
        output[encoded_event_id] = decrypt_archive_payload(text)
    return output


def run_apify_archive_fetch(
    token: str,
    requests: list[OddsPortalSeasonRequest],
    timeout_seconds: int = 300,
) -> tuple[list[dict[str, Any]], dict[int, dict[int, dict[str, Any]]]]:
    """Fetch and decrypt all requested season archive pages through Apify."""
    first_urls = [
        {
            "url": request.page_url(1),
            "userData": {"season": request.season, "page": 1},
        }
        for request in requests
    ]
    first_items = run_apify_web_scraper(
        token,
        build_archive_fetch_input(first_urls),
        timeout_seconds=timeout_seconds,
    )
    first_items = repair_empty_archive_items(first_items)
    decrypted = decrypt_archive_items(first_items)

    remaining_urls: list[dict[str, Any]] = []
    request_by_season = {request.season: request for request in requests}
    for season, pages in decrypted.items():
        page_count = int(pages[1].get("d", {}).get("pagination", {}).get("pageCount", 1))
        for page in range(2, page_count + 1):
            request = request_by_season[season]
            remaining_urls.append(
                {
                    "url": request.page_url(page),
                    "userData": {"season": season, "page": page},
                }
            )

    all_items = list(first_items)
    if remaining_urls:
        remaining_items = run_apify_web_scraper(
            token,
            build_archive_fetch_input(remaining_urls),
            timeout_seconds=timeout_seconds,
        )
        remaining_items = repair_empty_archive_items(remaining_items)
        all_items.extend(remaining_items)
        for season, pages in decrypt_archive_items(remaining_items).items():
            decrypted.setdefault(season, {}).update(pages)
    return all_items, decrypted


def match_event_url(
    encoded_event_id: str,
    *,
    betting_type: int = 2,
    scope: int = 2,
    bookiehash: str = ODDSPORTAL_MATCH_EVENT_BOOKIEHASH,
    cache_bust: int | None = None,
) -> str:
    """Build an OddsPortal encrypted event-market endpoint URL."""
    stamp = cache_bust if cache_bust is not None else int(time.time() * 1000)
    return (
        "https://www.oddsportal.com/"
        f"match-event/1-1-{encoded_event_id}-{betting_type}-{scope}-{bookiehash}.dat?_={stamp}"
    )


def _encoded_event_id_from_row(row: Any) -> str:
    encoded = getattr(row, "oddsportal_encoded_event_id", "")
    if isinstance(encoded, str) and encoded.strip():
        return encoded.strip()
    url = str(getattr(row, "oddsportal_url", "") or "")
    return _encoded_event_id_from_url(url)


def _encoded_event_id_from_url(url: str) -> str:
    if "#" in url:
        return url.rsplit("#", 1)[-1].strip()
    return ""


def run_apify_match_event_fetch(
    token: str,
    parsed_rows: pd.DataFrame,
    *,
    betting_type: int = 2,
    scope: int = 2,
    timeout_seconds: int = 300,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Fetch and decrypt event-level market payloads through Apify."""
    if parsed_rows.empty:
        return [], {}

    urls: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in parsed_rows.itertuples(index=False):
        encoded_event_id = _encoded_event_id_from_row(row)
        if not encoded_event_id or encoded_event_id in seen:
            continue
        seen.add(encoded_event_id)
        urls.append(
            {
                "url": match_event_url(
                    encoded_event_id,
                    betting_type=betting_type,
                    scope=scope,
                ),
                "userData": {
                    "season": int(getattr(row, "season")),
                    "oddsportal_event_id": str(getattr(row, "oddsportal_event_id", "")),
                    "encoded_event_id": encoded_event_id,
                    "betting_type": betting_type,
                    "scope": scope,
                },
            }
        )

    if not urls:
        return [], {}
    items = run_apify_web_scraper(
        token,
        build_match_event_fetch_input(urls),
        timeout_seconds=timeout_seconds,
    )
    return items, decrypt_match_event_items(items)


def _direct_match_event_item(url: str, user_data: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    return _direct_encrypted_item(url, user_data, timeout_seconds=timeout_seconds)


def run_direct_match_event_fetch(
    parsed_rows: pd.DataFrame,
    *,
    betting_type: int = 2,
    scope: int = 2,
    request_timeout_seconds: int = 30,
    max_workers: int = 8,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Fetch and decrypt event-level market payloads directly."""
    if parsed_rows.empty:
        return [], {}

    requests: list[tuple[str, dict[str, Any]]] = []
    seen: set[str] = set()
    for row in parsed_rows.itertuples(index=False):
        encoded_event_id = _encoded_event_id_from_row(row)
        if not encoded_event_id or encoded_event_id in seen:
            continue
        seen.add(encoded_event_id)
        user_data = {
            "season": int(getattr(row, "season")),
            "oddsportal_event_id": str(getattr(row, "oddsportal_event_id", "")),
            "encoded_event_id": encoded_event_id,
            "betting_type": betting_type,
            "scope": scope,
        }
        requests.append(
            (
                match_event_url(
                    encoded_event_id,
                    betting_type=betting_type,
                    scope=scope,
                ),
                user_data,
            )
        )

    items: list[dict[str, Any]] = []
    workers = max(1, int(max_workers))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(_direct_match_event_item, url, user_data, request_timeout_seconds)
            for url, user_data in requests
        ]
        for future in as_completed(futures):
            items.append(future.result())

    return items, decrypt_match_event_items(items)


def canonicalize_oddsportal_team(value: str) -> str:
    """Map OddsPortal women's team labels into model naming."""
    stripped = re.sub(r"\s+W$", "", str(value or "").strip(), flags=re.IGNORECASE)
    key = normalize_team_key(stripped)
    return ODDSPORTAL_TEAM_ALIASES.get(key, canonicalize_team_name(stripped))


def _team_key(value: str) -> str:
    return normalize_team_key(canonicalize_oddsportal_team(value))


def _safe_float(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float("nan")
    return parsed if math.isfinite(parsed) else float("nan")


def archive_pages_to_match_rows(decrypted_pages: dict[int, dict[int, dict[str, Any]]]) -> pd.DataFrame:
    """Flatten decrypted OddsPortal archive pages to match-level historical odds rows."""
    rows: list[dict[str, Any]] = []
    for season, pages in sorted(decrypted_pages.items()):
        for page, payload in sorted(pages.items()):
            for row in payload.get("d", {}).get("rows", []):
                odds = row.get("odds") or []
                if len(odds) < 3:
                    continue
                kickoff = datetime.fromtimestamp(int(row["date-start-timestamp"]), tz=UTC)
                rows.append(
                    {
                        "season": int(season),
                        "page": int(page),
                        "oddsportal_event_id": str(row.get("id", "")),
                        "oddsportal_encoded_event_id": str(row.get("encodeEventId", "")).strip()
                        or _encoded_event_id_from_url(str(row.get("url", "") or "")),
                        "oddsportal_url": row.get("url"),
                        "match_datetime": kickoff.isoformat(),
                        "match_date": kickoff.date().isoformat(),
                        "home_team_raw": row.get("home-name", ""),
                        "away_team_raw": row.get("away-name", ""),
                        "home_team": canonicalize_oddsportal_team(str(row.get("home-name", ""))),
                        "away_team": canonicalize_oddsportal_team(str(row.get("away-name", ""))),
                        "home_key": _team_key(str(row.get("home-name", ""))),
                        "away_key": _team_key(str(row.get("away-name", ""))),
                        "home_result": row.get("homeResult"),
                        "away_result": row.get("awayResult"),
                        "result": row.get("result"),
                        "home_avg_odds": _safe_float(odds[0].get("avgOdds")),
                        "draw_avg_odds": _safe_float(odds[1].get("avgOdds")),
                        "away_avg_odds": _safe_float(odds[2].get("avgOdds")),
                        "home_max_odds": _safe_float(odds[0].get("maxOdds")),
                        "draw_max_odds": _safe_float(odds[1].get("maxOdds")),
                        "away_max_odds": _safe_float(odds[2].get("maxOdds")),
                    }
                )
    return pd.DataFrame(rows)


def _mean_valid(values: list[float]) -> float:
    valid = [value for value in values if math.isfinite(value) and value > 1.0]
    return float(np.mean(valid)) if valid else float("nan")


_TOTAL_LINE_COLUMNS = [
    "line",
    "over_odds",
    "under_odds",
    "over_open_odds",
    "under_open_odds",
    "open_timestamp",
    "sportsbook_count",
]


def _provider_pair(prices: Any) -> tuple[float, float]:
    """Extract the (over, under) price pair from one provider's odds entry."""
    if isinstance(prices, list) and len(prices) >= 2:
        return _safe_float(prices[0]), _safe_float(prices[1])
    if isinstance(prices, dict):
        return _safe_float(prices.get("0")), _safe_float(prices.get("1"))
    return float("nan"), float("nan")


def _earliest_opening_timestamp(opening_change_time: Any) -> str:
    """Return the earliest opening-change unix time as a UTC ISO string, or ''."""
    if not isinstance(opening_change_time, dict):
        return ""
    stamps: list[int] = []
    for value in opening_change_time.values():
        if isinstance(value, dict):
            candidates: Iterable[Any] = value.values()
        elif isinstance(value, list):
            candidates = value
        else:
            candidates = [value]
        for stamp in candidates:
            stamp_float = _safe_float(stamp)
            if math.isfinite(stamp_float) and stamp_float > 0:
                stamps.append(int(stamp_float))
    if not stamps:
        return ""
    return datetime.fromtimestamp(min(stamps), tz=UTC).isoformat()


def _parse_total_payload_lines(payload: dict[str, Any]) -> pd.DataFrame:
    """Parse OddsPortal event payload total lines into average over/under prices.

    Emits both the current (close) average and, when the payload carries
    ``openingOdd`` / ``openingChangeTime``, the opening average and the earliest
    opening timestamp so callers can build an open->close CLV pair.
    """
    rows: list[dict[str, Any]] = []
    oddsdata = payload.get("d", {}).get("oddsdata", {}).get("back", {})
    if not isinstance(oddsdata, dict):
        return pd.DataFrame(columns=_TOTAL_LINE_COLUMNS)

    for entry in oddsdata.values():
        if not isinstance(entry, dict):
            continue
        if int(entry.get("bettingTypeId", 0) or 0) != 2:
            continue
        if int(entry.get("scopeId", 0) or 0) != 2:
            continue
        line = _safe_float(entry.get("handicapValue"))
        if not math.isfinite(line):
            continue

        over_prices: list[float] = []
        under_prices: list[float] = []
        odds_by_provider = entry.get("odds", {})
        if not isinstance(odds_by_provider, dict):
            continue
        for prices in odds_by_provider.values():
            over, under = _provider_pair(prices)
            over_prices.append(over)
            under_prices.append(under)

        over_odds = _mean_valid(over_prices)
        under_odds = _mean_valid(under_prices)
        if not (math.isfinite(over_odds) and math.isfinite(under_odds)):
            continue

        over_open_prices: list[float] = []
        under_open_prices: list[float] = []
        opening_by_provider = entry.get("openingOdd", {})
        if isinstance(opening_by_provider, dict):
            for prices in opening_by_provider.values():
                over, under = _provider_pair(prices)
                over_open_prices.append(over)
                under_open_prices.append(under)
        over_open_odds = _mean_valid(over_open_prices)
        under_open_odds = _mean_valid(under_open_prices)
        open_timestamp = _earliest_opening_timestamp(entry.get("openingChangeTime"))

        rows.append(
            {
                "line": line,
                "over_odds": over_odds,
                "under_odds": under_odds,
                "over_open_odds": over_open_odds,
                "under_open_odds": under_open_odds,
                "open_timestamp": open_timestamp,
                "sportsbook_count": int(
                    min(
                        len([value for value in over_prices if math.isfinite(value) and value > 1.0]),
                        len([value for value in under_prices if math.isfinite(value) and value > 1.0]),
                    )
                ),
            }
        )

    return pd.DataFrame(rows).sort_values("line").reset_index(drop=True) if rows else pd.DataFrame(
        columns=_TOTAL_LINE_COLUMNS
    )


def _select_main_total_rows(total_lines: pd.DataFrame) -> pd.DataFrame:
    if total_lines.empty:
        return total_lines
    lines = total_lines["line"].astype(float)
    preferred = total_lines[np.isclose(lines, 2.5)]
    if not preferred.empty:
        return preferred.head(1)
    chosen_idx = (lines - 2.5).abs().sort_values(kind="stable").index[0]
    return total_lines.loc[[chosen_idx]]


def build_historical_total_odds_contract(
    parsed_rows: pd.DataFrame,
    matches: pd.DataFrame,
    total_payloads: dict[str, dict[str, Any]],
    *,
    include_all_total_lines: bool = False,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match OddsPortal event total markets to model match IDs."""
    if parsed_rows.empty or not total_payloads:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), parsed_rows.copy()

    match_ref = matches.copy()
    match_ref["match_id"] = match_ref["match_id"].astype(str)
    match_ref["match_date_dt"] = pd.to_datetime(match_ref["match_date"], errors="coerce").dt.date
    match_ref["home_key"] = match_ref["home_team"].map(_team_key)
    match_ref["away_key"] = match_ref["away_team"].map(_team_key)
    match_ref["season"] = pd.to_numeric(match_ref["season"], errors="coerce").astype("Int64")

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in parsed_rows.itertuples(index=False):
        encoded_event_id = _encoded_event_id_from_row(row)
        payload = total_payloads.get(encoded_event_id)
        total_lines = _parse_total_payload_lines(payload or {})
        if total_lines.empty:
            unmatched_rows.append({**row._asdict(), "reason": "no_total_market_payload"})
            continue
        selected = total_lines if include_all_total_lines else _select_main_total_rows(total_lines)

        odds_date = pd.to_datetime(row.match_date).date()
        candidates = match_ref[
            (match_ref["season"] == int(row.season))
            & (match_ref["home_key"] == row.home_key)
            & (match_ref["away_key"] == row.away_key)
        ].copy()
        if not candidates.empty:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda match_date: abs((match_date - odds_date).days) if pd.notna(match_date) else 999
            )
            candidates = candidates[candidates["date_delta_days"] <= max_date_delta_days].sort_values(
                ["date_delta_days", "match_date_dt", "match_id"]
            )
        if candidates.empty:
            unmatched_rows.append({**row._asdict(), "reason": "no_model_match_within_date_tolerance"})
            continue

        match = candidates.iloc[0]
        for total_row in selected.itertuples(index=False):
            open_over = getattr(total_row, "over_open_odds", float("nan"))
            open_under = getattr(total_row, "under_open_odds", float("nan"))
            open_timestamp = str(getattr(total_row, "open_timestamp", "") or "")
            if (
                math.isfinite(_safe_float(open_over))
                and math.isfinite(_safe_float(open_under))
                and open_timestamp
                and open_timestamp != row.match_datetime
            ):
                contract_rows.append(
                    {
                        "match_id": str(match["match_id"]),
                        "timestamp": open_timestamp,
                        "sportsbook": "OddsPortalAvg",
                        "market_type": "total",
                        "line": float(total_row.line),
                        "home_odds": np.nan,
                        "draw_odds": np.nan,
                        "away_odds": np.nan,
                        "over_odds": float(open_over),
                        "under_odds": float(open_under),
                        "source_type": "open",
                    }
                )
            contract_rows.append(
                {
                    "match_id": str(match["match_id"]),
                    "timestamp": row.match_datetime,
                    "sportsbook": "OddsPortalAvg",
                    "market_type": "total",
                    "line": float(total_row.line),
                    "home_odds": np.nan,
                    "draw_odds": np.nan,
                    "away_odds": np.nan,
                    "over_odds": float(total_row.over_odds),
                    "under_odds": float(total_row.under_odds),
                    "source_type": "close",
                }
            )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    unmatched = pd.DataFrame(unmatched_rows)
    if not contract.empty:
        contract = contract.dropna(subset=["line", "over_odds", "under_odds"])
        contract = contract.drop_duplicates(
            subset=["match_id", "sportsbook", "market_type", "line", "source_type"],
            keep="last",
        )
        contract = contract.sort_values(["match_id", "sportsbook", "line"]).reset_index(drop=True)
    return contract, unmatched


def _provider_triple(prices: Any) -> tuple[float, float, float]:
    """Extract (home, draw, away) from one provider's 1X2 odds entry.

    Verified OddsPortal encoding: outcomeId '0'=home, '1'=draw, '2'=away. Entries
    arrive as a dict keyed by those ids; a positional list is accepted as a
    fallback for robustness.
    """
    if isinstance(prices, dict):
        return (
            _safe_float(prices.get("0")),
            _safe_float(prices.get("1")),
            _safe_float(prices.get("2")),
        )
    if isinstance(prices, list) and len(prices) >= 3:
        return _safe_float(prices[0]), _safe_float(prices[1]), _safe_float(prices[2])
    return float("nan"), float("nan"), float("nan")


def _parse_1x2_payload_open_close(payload: dict[str, Any]) -> dict[str, float | str]:
    """Average a 1X2 event payload into home/draw/away open and close prices."""
    oddsdata = payload.get("d", {}).get("oddsdata", {}).get("back", {})
    if not isinstance(oddsdata, dict):
        return {}
    for entry in oddsdata.values():
        if not isinstance(entry, dict):
            continue
        if int(entry.get("bettingTypeId", 0) or 0) != 1:
            continue
        if int(entry.get("scopeId", 0) or 0) != 2:
            continue
        home_close, draw_close, away_close = [], [], []
        odds_by_provider = entry.get("odds", {})
        if not isinstance(odds_by_provider, dict):
            continue
        for prices in odds_by_provider.values():
            home, draw, away = _provider_triple(prices)
            home_close.append(home)
            draw_close.append(draw)
            away_close.append(away)
        home_c, draw_c, away_c = _mean_valid(home_close), _mean_valid(draw_close), _mean_valid(away_close)
        if not (math.isfinite(home_c) and math.isfinite(draw_c) and math.isfinite(away_c)):
            continue

        home_open, draw_open, away_open = [], [], []
        opening_by_provider = entry.get("openingOdd", {})
        if isinstance(opening_by_provider, dict):
            for prices in opening_by_provider.values():
                home, draw, away = _provider_triple(prices)
                home_open.append(home)
                draw_open.append(draw)
                away_open.append(away)
        return {
            "home_close": home_c,
            "draw_close": draw_c,
            "away_close": away_c,
            "home_open": _mean_valid(home_open),
            "draw_open": _mean_valid(draw_open),
            "away_open": _mean_valid(away_open),
            "open_timestamp": _earliest_opening_timestamp(entry.get("openingChangeTime")),
        }
    return {}


def build_historical_1x2_open_close_contract(
    parsed_rows: pd.DataFrame,
    matches: pd.DataFrame,
    payloads: dict[str, dict[str, Any]],
    *,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match OddsPortal 1X2 event payloads to model IDs, emitting open+close rows.

    Rows are tagged sportsbook="OddsPortalEvent" so the internally-consistent
    open/close pair (both from the same event payload) never collides with the
    archive's consensus close rows (sportsbook="OddsPortalAvg").
    """
    if parsed_rows.empty or not payloads:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), parsed_rows.copy()

    match_ref = matches.copy()
    match_ref["match_id"] = match_ref["match_id"].astype(str)
    match_ref["match_date_dt"] = pd.to_datetime(match_ref["match_date"], errors="coerce").dt.date
    match_ref["home_key"] = match_ref["home_team"].map(_team_key)
    match_ref["away_key"] = match_ref["away_team"].map(_team_key)
    match_ref["season"] = pd.to_numeric(match_ref["season"], errors="coerce").astype("Int64")

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in parsed_rows.itertuples(index=False):
        encoded_event_id = _encoded_event_id_from_row(row)
        parsed = _parse_1x2_payload_open_close(payloads.get(encoded_event_id) or {})
        if not parsed:
            unmatched_rows.append({**row._asdict(), "reason": "no_1x2_market_payload"})
            continue

        odds_date = pd.to_datetime(row.match_date).date()
        candidates = match_ref[
            (match_ref["season"] == int(row.season))
            & (match_ref["home_key"] == row.home_key)
            & (match_ref["away_key"] == row.away_key)
        ].copy()
        if not candidates.empty:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda match_date: abs((match_date - odds_date).days) if pd.notna(match_date) else 999
            )
            candidates = candidates[candidates["date_delta_days"] <= max_date_delta_days].sort_values(
                ["date_delta_days", "match_date_dt", "match_id"]
            )
        if candidates.empty:
            unmatched_rows.append({**row._asdict(), "reason": "no_model_match_within_date_tolerance"})
            continue

        match = candidates.iloc[0]
        open_ts = str(parsed.get("open_timestamp") or "")
        if (
            math.isfinite(_safe_float(parsed.get("home_open")))
            and math.isfinite(_safe_float(parsed.get("draw_open")))
            and math.isfinite(_safe_float(parsed.get("away_open")))
            and open_ts
            and open_ts != row.match_datetime
        ):
            contract_rows.append(
                {
                    "match_id": str(match["match_id"]),
                    "timestamp": open_ts,
                    "sportsbook": "OddsPortalEvent",
                    "market_type": "1x2",
                    "line": np.nan,
                    "home_odds": float(parsed["home_open"]),
                    "draw_odds": float(parsed["draw_open"]),
                    "away_odds": float(parsed["away_open"]),
                    "over_odds": np.nan,
                    "under_odds": np.nan,
                    "source_type": "open",
                }
            )
        contract_rows.append(
            {
                "match_id": str(match["match_id"]),
                "timestamp": row.match_datetime,
                "sportsbook": "OddsPortalEvent",
                "market_type": "1x2",
                "line": np.nan,
                "home_odds": float(parsed["home_close"]),
                "draw_odds": float(parsed["draw_close"]),
                "away_odds": float(parsed["away_close"]),
                "over_odds": np.nan,
                "under_odds": np.nan,
                "source_type": "close",
            }
        )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    unmatched = pd.DataFrame(unmatched_rows)
    if not contract.empty:
        contract = contract.drop_duplicates(
            subset=["match_id", "sportsbook", "market_type", "line", "source_type"],
            keep="last",
        )
        contract = contract.sort_values(["match_id", "sportsbook", "source_type"]).reset_index(drop=True)
    return contract, unmatched


def build_historical_odds_contract(
    parsed_rows: pd.DataFrame,
    matches: pd.DataFrame,
    include_max_book: bool = False,
    max_date_delta_days: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Match OddsPortal rows to model match IDs and return close odds contract rows."""
    if parsed_rows.empty:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS), parsed_rows.copy()

    match_ref = matches.copy()
    match_ref["match_id"] = match_ref["match_id"].astype(str)
    match_ref["match_date_dt"] = pd.to_datetime(match_ref["match_date"], errors="coerce").dt.date
    match_ref["home_key"] = match_ref["home_team"].map(_team_key)
    match_ref["away_key"] = match_ref["away_team"].map(_team_key)
    match_ref["season"] = pd.to_numeric(match_ref["season"], errors="coerce").astype("Int64")

    contract_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    for row in parsed_rows.itertuples(index=False):
        odds_date = pd.to_datetime(row.match_date).date()
        candidates = match_ref[
            (match_ref["season"] == int(row.season))
            & (match_ref["home_key"] == row.home_key)
            & (match_ref["away_key"] == row.away_key)
        ].copy()
        if not candidates.empty:
            candidates["date_delta_days"] = candidates["match_date_dt"].map(
                lambda match_date: abs((match_date - odds_date).days) if pd.notna(match_date) else 999
            )
            candidates = candidates[candidates["date_delta_days"] <= max_date_delta_days].sort_values(
                ["date_delta_days", "match_date_dt", "match_id"]
            )
        if candidates.empty:
            unmatched_rows.append({**row._asdict(), "reason": "no_model_match_within_date_tolerance"})
            continue

        match = candidates.iloc[0]
        books = [
            (
                "OddsPortalAvg",
                row.home_avg_odds,
                row.draw_avg_odds,
                row.away_avg_odds,
            )
        ]
        if include_max_book:
            books.append(
                (
                    "OddsPortalMax",
                    row.home_max_odds,
                    row.draw_max_odds,
                    row.away_max_odds,
                )
            )
        for sportsbook, home_odds, draw_odds, away_odds in books:
            contract_rows.append(
                {
                    "match_id": str(match["match_id"]),
                    "timestamp": row.match_datetime,
                    "sportsbook": sportsbook,
                    "market_type": "1x2",
                    "line": np.nan,
                    "home_odds": home_odds,
                    "draw_odds": draw_odds,
                    "away_odds": away_odds,
                    "over_odds": np.nan,
                    "under_odds": np.nan,
                    "source_type": "close",
                }
            )

    contract = pd.DataFrame(contract_rows, columns=ODDS_CONTRACT_COLUMNS)
    unmatched = pd.DataFrame(unmatched_rows)
    if not contract.empty:
        contract = contract.dropna(subset=["home_odds", "draw_odds", "away_odds"])
        contract = contract.drop_duplicates(
            subset=["match_id", "sportsbook", "market_type", "line", "source_type"],
            keep="last",
        )
        contract = contract.sort_values(["match_id", "sportsbook"]).reset_index(drop=True)
    return contract, unmatched


def merge_historical_with_existing_odds(existing: pd.DataFrame, historical: pd.DataFrame) -> pd.DataFrame:
    """Merge close historical rows with current/raw odds while preserving the contract columns."""
    frames = []
    if existing is not None and not existing.empty:
        frames.append(existing.copy())
    if historical is not None and not historical.empty:
        frames.append(historical.copy())
    if not frames:
        return pd.DataFrame(columns=ODDS_CONTRACT_COLUMNS)

    combined = pd.concat(frames, ignore_index=True, sort=False)
    for column in ODDS_CONTRACT_COLUMNS:
        if column not in combined.columns:
            combined[column] = np.nan
    combined = combined[ODDS_CONTRACT_COLUMNS].copy()
    combined["match_id"] = combined["match_id"].astype(str)
    combined = combined.drop_duplicates(
        subset=["match_id", "sportsbook", "market_type", "line", "source_type"],
        keep="last",
    )
    return combined.sort_values(["source_type", "match_id", "sportsbook"]).reset_index(drop=True)
