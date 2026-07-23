import sys

import pandas as pd
import pytest

from src.odds.apify_oddsportal import (
    archive_pages_to_match_rows,
    build_historical_1x2_open_close_contract,
    build_historical_odds_contract,
    build_historical_total_odds_contract,
    decrypt_match_event_items,
    extract_odds_request_from_html,
    merge_historical_with_existing_odds,
    resolve_season_requests,
)


def test_build_historical_1x2_open_close_contract_emits_open_and_close() -> None:
    # Verified OddsPortal 1X2 event structure: per-provider odds is a dict keyed
    # by outcomeId where '0'=home, '1'=draw, '2'=away. openingOdd mirrors it and
    # openingChangeTime carries the opening unix time. We emit an open row at the
    # opening time and a close row at kickoff so CLV can pair the movement.
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Orlando W",
                "away_team_raw": "Gotham W",
                "home_key": "orlando pride",
                "away_key": "gotham fc",
                "oddsportal_encoded_event_id": "abc123",
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Orlando Pride",
                "away_team": "Gotham FC",
            }
        ]
    )
    payloads = {
        "abc123": {
            "d": {
                "oddsdata": {
                    "back": {
                        "E-1-2-0-0-0": {
                            "bettingTypeId": 1,
                            "scopeId": 2,
                            "odds": {"851": {"0": 2.90, "1": 3.10, "2": 2.15}},
                            "openingOdd": {"851": {"0": 2.50, "1": 3.20, "2": 2.40}},
                            "openingChangeTime": {"851": {"0": 1762064173, "1": 1762064173, "2": 1762064173}},
                        }
                    }
                }
            }
        }
    }

    contract, unmatched = build_historical_1x2_open_close_contract(parsed, matches, payloads)

    assert unmatched.empty
    assert sorted(contract["source_type"].unique().tolist()) == ["close", "open"]
    open_row = contract[contract["source_type"] == "open"].iloc[0]
    close_row = contract[contract["source_type"] == "close"].iloc[0]
    assert open_row["market_type"] == "1x2"
    assert open_row["home_odds"] == 2.50
    assert open_row["draw_odds"] == 3.20
    assert open_row["away_odds"] == 2.40
    assert close_row["home_odds"] == 2.90
    assert close_row["draw_odds"] == 3.10
    assert close_row["away_odds"] == 2.15
    assert open_row["timestamp"] != close_row["timestamp"]
    assert open_row["timestamp"].startswith("2025-11")
    # Distinct sportsbook so event open/close pairs stay internally consistent
    # and never collide with the archive's OddsPortalAvg close rows.
    assert open_row["sportsbook"] == "OddsPortalEvent"
    assert close_row["sportsbook"] == "OddsPortalEvent"


def test_build_historical_1x2_open_close_contract_close_only_without_opening() -> None:
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Orlando W",
                "away_team_raw": "Gotham W",
                "home_key": "orlando pride",
                "away_key": "gotham fc",
                "oddsportal_encoded_event_id": "abc123",
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Orlando Pride",
                "away_team": "Gotham FC",
            }
        ]
    )
    payloads = {
        "abc123": {
            "d": {
                "oddsdata": {
                    "back": {
                        "E-1-2-0-0-0": {
                            "bettingTypeId": 1,
                            "scopeId": 2,
                            "odds": {"851": {"0": 2.90, "1": 3.10, "2": 2.15}},
                        }
                    }
                }
            }
        }
    }

    contract, unmatched = build_historical_1x2_open_close_contract(parsed, matches, payloads)

    assert contract["source_type"].tolist() == ["close"]


def test_resolve_season_requests_from_apify_discovery(monkeypatch) -> None:
    discovery_items = [
        {
            "url": "https://www.oddsportal.com/football/usa/nwsl-women/results/",
            "oddsRequestAttr": (
                '{"url":"\\/ajax-sport-country-tournament-archive_\\/1\\/TOKEN\\/",'
                '"urlPartTz":0,"urlPartQs":"?_="}'
            ),
            "ajaxUserDataSrc": "https://www.oddsportal.com/ajax-user-data/t/1/?abc",
        }
    ]

    monkeypatch.setattr(
        "src.odds.apify_oddsportal.fetch_user_data_config",
        lambda _: {"bookiehash": "BOOKHASH", "usePremium": 1},
    )

    requests = resolve_season_requests(
        discovery_items,
        [2026],
        {2026: "https://www.oddsportal.com/football/usa/nwsl-women/results/"},
    )

    assert requests[0].archive_url == "/ajax-sport-country-tournament-archive_/1/TOKEN/"
    assert requests[0].page_url(2, cache_bust=123).endswith("/BOOKHASH/1/0/page/2/?_=123")


def test_resolve_season_requests_falls_back_to_page_outrights(monkeypatch) -> None:
    discovery_items = [
        {
            "url": "https://www.oddsportal.com/football/usa/nwsl-women/results/",
            "htmlSample": """<script>
                var pageOutrightsVar = '{"id":"YTSKY0BM","sid":1,"cid":200,"archive":true}';
            </script><script src="https://www.oddsportal.com/ajax-user-data/t/1/?abc"></script>""",
        }
    ]

    monkeypatch.setattr(
        "src.odds.apify_oddsportal.fetch_user_data_config",
        lambda _: {"bookiehash": "BOOKHASH", "usePremium": 1},
    )

    requests = resolve_season_requests(
        discovery_items,
        [2026],
        {2026: "https://www.oddsportal.com/football/usa/nwsl-women/results/"},
    )

    assert requests[0].archive_url == "/ajax-sport-country-tournament-archive_/1/YTSKY0BM/"


def test_archive_pages_to_match_rows_uses_1x2_order_and_skips_missing_odds() -> None:
    pages = {
        2026: {
            1: {
                "d": {
                    "rows": [
                        {
                            "id": 1,
                            "date-start-timestamp": 1779663600,
                            "home-name": "Denver Summit W",
                            "away-name": "Orlando Pride W",
                            "homeResult": "3",
                            "awayResult": "1",
                            "result": "3:1",
                            "url": "/football/h2h/test/#abc",
                            "odds": [
                                {"avgOdds": 2.4, "maxOdds": 2.5},
                                {"avgOdds": 3.1, "maxOdds": 3.2},
                                {"avgOdds": 2.7, "maxOdds": 2.8},
                            ],
                        },
                        {
                            "id": 2,
                            "date-start-timestamp": 1779663600,
                            "home-name": "Bay FC W",
                            "away-name": "Utah Royals W",
                            "odds": [],
                        },
                    ]
                }
            }
        }
    }

    rows = archive_pages_to_match_rows(pages)

    assert len(rows) == 1
    assert rows.loc[0, "home_team"] == "Denver Summit FC"
    assert rows.loc[0, "oddsportal_encoded_event_id"] == "abc"
    assert rows.loc[0, "home_avg_odds"] == 2.4
    assert rows.loc[0, "draw_avg_odds"] == 3.1
    assert rows.loc[0, "away_avg_odds"] == 2.7


def test_build_historical_odds_contract_matches_by_alias_and_date() -> None:
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Denver Summit W",
                "away_team_raw": "Orlando Pride W",
                "home_key": "denver summit fc",
                "away_key": "orlando pride",
                "home_avg_odds": 2.4,
                "draw_avg_odds": 3.1,
                "away_avg_odds": 2.7,
                "home_max_odds": 2.5,
                "draw_max_odds": 3.2,
                "away_max_odds": 2.8,
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Denver Summit FC",
                "away_team": "Orlando Pride",
            }
        ]
    )

    contract, unmatched = build_historical_odds_contract(parsed, matches, include_max_book=True)

    assert unmatched.empty
    assert contract["sportsbook"].tolist() == ["OddsPortalAvg", "OddsPortalMax"]
    assert contract.loc[0, "match_id"] == "m1"
    assert contract.loc[0, "source_type"] == "close"


def test_build_historical_total_odds_contract_selects_main_total_line() -> None:
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Denver Summit W",
                "away_team_raw": "Orlando Pride W",
                "home_key": "denver summit fc",
                "away_key": "orlando pride",
                "oddsportal_encoded_event_id": "abc123",
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Denver Summit FC",
                "away_team": "Orlando Pride",
            }
        ]
    )
    payloads = {
        "abc123": {
            "d": {
                "oddsdata": {
                    "back": {
                        "E-2-2-0-1.5-0": {
                            "bettingTypeId": 2,
                            "scopeId": 2,
                            "handicapValue": "1.50",
                            "odds": {"851": [1.25, 3.80]},
                        },
                        "E-2-2-0-2.5-0": {
                            "bettingTypeId": 2,
                            "scopeId": 2,
                            "handicapValue": "2.50",
                            "odds": {"851": [1.90, 1.90], "1205": [1.80, 2.00]},
                        },
                    }
                }
            }
        }
    }

    contract, unmatched = build_historical_total_odds_contract(parsed, matches, payloads)

    assert unmatched.empty
    assert contract["market_type"].tolist() == ["total"]
    assert contract.loc[0, "match_id"] == "m1"
    assert contract.loc[0, "line"] == 2.5
    assert contract.loc[0, "over_odds"] == 1.85
    assert contract.loc[0, "under_odds"] == 1.95


def test_build_historical_total_odds_contract_emits_open_and_close_rows() -> None:
    # The event payload carries opening odds (openingOdd / openingChangeTime)
    # alongside current odds. We emit a source_type="open" row at the opening
    # change time plus a source_type="close" row at kickoff so open_close_clv
    # can pair the two distinct timestamps and measure historical line movement.
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Denver Summit W",
                "away_team_raw": "Orlando Pride W",
                "home_key": "denver summit fc",
                "away_key": "orlando pride",
                "oddsportal_encoded_event_id": "abc123",
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Denver Summit FC",
                "away_team": "Orlando Pride",
            }
        ]
    )
    payloads = {
        "abc123": {
            "d": {
                "oddsdata": {
                    "back": {
                        "E-2-2-0-2.5-0": {
                            "bettingTypeId": 2,
                            "scopeId": 2,
                            "handicapValue": "2.50",
                            "odds": {"851": [1.75, 1.93]},
                            "openingOdd": {"851": [1.88, 1.80]},
                            "openingChangeTime": {"851": [1762064173, 1762064173]},
                        }
                    }
                }
            }
        }
    }

    contract, unmatched = build_historical_total_odds_contract(parsed, matches, payloads)

    assert unmatched.empty
    assert sorted(contract["source_type"].tolist()) == ["close", "open"]
    open_row = contract[contract["source_type"] == "open"].iloc[0]
    close_row = contract[contract["source_type"] == "close"].iloc[0]
    assert open_row["over_odds"] == 1.88
    assert open_row["under_odds"] == 1.80
    assert close_row["over_odds"] == 1.75
    assert close_row["under_odds"] == 1.93
    # Distinct timestamps so the open/close pair survives grouping.
    assert open_row["timestamp"] != close_row["timestamp"]
    assert open_row["timestamp"].startswith("2025-11")


def test_build_historical_total_odds_contract_close_only_when_no_opening_odds() -> None:
    # Regression: payloads without openingOdd must still yield a single close row.
    parsed = pd.DataFrame(
        [
            {
                "season": 2026,
                "match_datetime": "2026-05-17T20:00:00+00:00",
                "match_date": "2026-05-17",
                "home_team_raw": "Denver Summit W",
                "away_team_raw": "Orlando Pride W",
                "home_key": "denver summit fc",
                "away_key": "orlando pride",
                "oddsportal_encoded_event_id": "abc123",
            }
        ]
    )
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "season": 2026,
                "match_date": "2026-05-17",
                "home_team": "Denver Summit FC",
                "away_team": "Orlando Pride",
            }
        ]
    )
    payloads = {
        "abc123": {
            "d": {
                "oddsdata": {
                    "back": {
                        "E-2-2-0-2.5-0": {
                            "bettingTypeId": 2,
                            "scopeId": 2,
                            "handicapValue": "2.50",
                            "odds": {"851": [1.90, 1.90]},
                        }
                    }
                }
            }
        }
    }

    contract, unmatched = build_historical_total_odds_contract(parsed, matches, payloads)

    assert contract["source_type"].tolist() == ["close"]


def test_decrypt_match_event_items_skips_empty_payloads(monkeypatch) -> None:
    monkeypatch.setattr("src.odds.apify_oddsportal.decrypt_archive_payload", lambda text: {"text": text})

    payloads = decrypt_match_event_items(
        [
            {"userData": {"encoded_event_id": "abc"}, "text": "encrypted"},
            {"userData": {"encoded_event_id": "missing"}, "text": ""},
        ]
    )

    assert payloads == {"abc": {"text": "encrypted"}}


def test_extract_odds_request_from_html_parses_escaped_odds_request_attribute() -> None:
    # Mirrors the shape the Apify page function pulls off <next-matches
    # :odds-request='...'>: real HTML escapes the embedded JSON's double quotes
    # as &quot; since the attribute itself is single-quoted here (and the Apify
    # page-function's htmlSample regex expects the double-quoted form, which is
    # what OddsPortal's server-rendered markup actually emits).
    html_text = (
        "<next-matches "
        ':odds-request="{&quot;url&quot;:&quot;\\/ajax-sport-country-tournament-archive_\\/1\\/TOKEN\\/&quot;,'
        "&quot;urlPartTz&quot;:0,&quot;urlPartQs&quot;:&quot;?_=&quot;}\""
        "></next-matches>"
    )

    parsed = extract_odds_request_from_html(html_text)

    assert parsed == {
        "url": "/ajax-sport-country-tournament-archive_/1/TOKEN/",
        "urlPartTz": 0,
        "urlPartQs": "?_=",
    }


def test_extract_odds_request_from_html_raises_clear_error_when_missing() -> None:
    with pytest.raises(ValueError, match="odds-request"):
        extract_odds_request_from_html("<html><body>no markup here</body></html>")


def test_direct_archive_fetch_mode_avoids_apify_and_works_without_token(tmp_path, monkeypatch) -> None:
    import scripts.fetch_apify_oddsportal_history as history_script

    def _forbid_apify(*_args, **_kwargs):
        raise AssertionError("Apify should not be called when --archive-fetch-mode direct")

    monkeypatch.setattr(history_script, "load_env_token", lambda *a, **k: "")
    monkeypatch.setattr(history_script, "run_apify_web_scraper", _forbid_apify)
    monkeypatch.setattr(history_script, "run_apify_archive_fetch", _forbid_apify)
    monkeypatch.setattr(history_script, "run_apify_match_event_fetch", _forbid_apify)

    fetched_urls: list[str] = []

    def _fake_fetch_results_page_html(url: str, *, timeout: int = 30) -> str:
        fetched_urls.append(url)
        return (
            "<next-matches "
            ':odds-request="{&quot;url&quot;:&quot;\\/ajax-sport-country-tournament-archive_\\/1\\/TOKEN\\/&quot;,'
            "&quot;urlPartTz&quot;:0,&quot;urlPartQs&quot;:&quot;?_=&quot;}\""
            "></next-matches>"
            '<script src="https://www.oddsportal.com/ajax-user-data/t/1/?abc"></script>'
        )

    direct_archive_calls: list[list] = []

    def _fake_run_direct_archive_fetch(requests, **_kwargs):
        direct_archive_calls.append(requests)
        return [
            {
                "url": "https://www.oddsportal.com/archive",
                "userData": {"season": 2026, "page": 1},
                "text": "encrypted",
            }
        ]

    monkeypatch.setattr(history_script, "fetch_results_page_html", _fake_fetch_results_page_html)
    monkeypatch.setattr(history_script, "run_direct_archive_fetch", _fake_run_direct_archive_fetch)
    monkeypatch.setattr(history_script, "decrypt_archive_items", lambda items: {2026: {1: {"d": {"rows": []}}}})
    monkeypatch.setattr(
        "src.odds.apify_oddsportal.fetch_user_data_config",
        lambda _: {"bookiehash": "BOOKHASH", "usePremium": 1},
    )

    matches_path = tmp_path / "matches.csv"
    matches_path.write_text("match_id,season,match_date,home_team,away_team\n", encoding="utf-8")

    argv = [
        "fetch_apify_oddsportal_history.py",
        "--seasons",
        "2026",
        "--matches",
        str(matches_path),
        "--existing-odds",
        str(tmp_path / "missing_odds.csv"),
        "--output",
        str(tmp_path / "odds.csv"),
        "--historical-output",
        str(tmp_path / "historical.csv"),
        "--historical-total-output",
        str(tmp_path / "historical_total.csv"),
        "--parsed-output",
        str(tmp_path / "parsed.csv"),
        "--unmatched-output",
        str(tmp_path / "unmatched.csv"),
        "--raw-output",
        str(tmp_path / "raw.json"),
        "--raw-total-output",
        str(tmp_path / "raw_total.json"),
        "--discovery-output",
        str(tmp_path / "discovery.json"),
        "--report-output",
        str(tmp_path / "report.json"),
        "--archive-fetch-mode",
        "direct",
        "--skip-total-markets",
    ]
    monkeypatch.setattr(sys, "argv", argv)

    history_script.main()

    assert fetched_urls == ["https://www.oddsportal.com/football/usa/nwsl-women/results/"]
    assert len(direct_archive_calls) == 1
    assert (tmp_path / "odds.csv").exists()


def test_merge_historical_with_existing_odds_deduplicates_contract_rows() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-26T00:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.0,
                "away_odds": 4.0,
                "source_type": "current",
            }
        ]
    )
    historical = existing.copy()
    historical["sportsbook"] = "OddsPortalAvg"
    historical["source_type"] = "close"

    combined = merge_historical_with_existing_odds(existing, historical)

    assert combined["source_type"].tolist() == ["close", "current"]
    assert combined["sportsbook"].tolist() == ["OddsPortalAvg", "FootyStats"]
