from __future__ import annotations

import pandas as pd

from src.tracking.pick_ledger import (
    extract_picks_from_slate,
    merge_new_picks,
    render_record_report,
    settle_picks,
    summarize_record,
)


def _slate() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "match_date": "2026-05-29",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "pick_tier": "official_pick",
                "model_version": "champ-1",
                "recommended_bets": "1x2_home@1.85(prob_edge=0.086,ev=0.042,stake=10.0)",
                "recommended_leans": "total_over_2.5@1.77(prob_edge=0.077,ev=0.058,stake=10.0)",
            },
            {
                "match_id": "401853924",
                "match_date": "2026-05-30",
                "home_team": "Washington Spirit",
                "away_team": "Seattle Reign FC",
                "pick_tier": "no_bet",
                "model_version": "champ-1",
                "recommended_bets": "none",
                "recommended_leans": "none",
            },
        ]
    )


def test_extract_picks_parses_official_and_lean_rows() -> None:
    picks = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")

    # Two actionable picks: one official (1x2 home), one lean (total over). no_bet row ignored.
    assert len(picks) == 2
    official = picks[picks["tier"] == "official_pick"].iloc[0]
    assert official["match_id"] == "401853922"
    assert official["market"] == "1x2"
    assert official["side"] == "home"
    assert pd.isna(official["line"])
    assert official["odds"] == 1.85
    assert official["recorded_at"] == "2026-05-28T12:00:00Z"

    lean = picks[picks["tier"] == "lean"].iloc[0]
    assert lean["market"] == "total"
    assert lean["side"] == "over"
    assert lean["line"] == 2.5
    assert lean["odds"] == 1.77

    # Every pick gets a stable, unique id.
    assert picks["pick_id"].is_unique


def test_merge_new_picks_is_idempotent_and_locks_first_odds() -> None:
    first = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")
    ledger = merge_new_picks(pd.DataFrame(), first)
    assert len(ledger) == 2

    # Re-run next day: same picks, but odds drifted. Must NOT duplicate or overwrite.
    drifted = _slate()
    drifted.loc[0, "recommended_bets"] = "1x2_home@1.70(prob_edge=0.05,ev=0.02,stake=10.0)"
    second = extract_picks_from_slate(drifted, recorded_at="2026-05-29T12:00:00Z")
    ledger2 = merge_new_picks(ledger, second)

    assert len(ledger2) == 2  # no new rows
    locked = ledger2[ledger2["market"] == "1x2"].iloc[0]
    assert locked["odds"] == 1.85  # original odds preserved
    assert locked["recorded_at"] == "2026-05-28T12:00:00Z"


def test_settle_picks_grades_results_and_pnl() -> None:
    picks = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")
    # Orlando 2-1 Bay: home win (1x2 home WIN), total 3 goals > 2.5 (over WIN).
    matches = pd.DataFrame(
        [
            {
                "match_id": "401853922",
                "match_status": "completed",
                "home_goals_90": 2,
                "away_goals_90": 1,
            }
        ]
    )
    settled = settle_picks(picks, matches)

    home_pick = settled[settled["market"] == "1x2"].iloc[0]
    assert home_pick["result"] == "win"
    assert round(home_pick["pnl_per_unit"], 2) == 0.85  # odds 1.85 - 1

    over_pick = settled[settled["market"] == "total"].iloc[0]
    assert over_pick["result"] == "win"
    assert round(over_pick["pnl_per_unit"], 2) == 0.77


def test_settle_leaves_unplayed_picks_pending() -> None:
    picks = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")
    settled = settle_picks(picks, pd.DataFrame(columns=["match_id", "match_status", "home_goals_90", "away_goals_90"]))
    assert (settled["result"] == "pending").all()
    assert settled["pnl_per_unit"].isna().all()


def test_summarize_record_reports_cumulative_and_by_tier() -> None:
    picks = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")
    matches = pd.DataFrame(
        [{"match_id": "401853922", "match_status": "completed", "home_goals_90": 2, "away_goals_90": 1}]
    )
    settled = settle_picks(picks, matches)
    summary = summarize_record(settled)

    assert summary["settled"] == 2
    assert summary["wins"] == 2
    assert summary["losses"] == 0
    assert summary["pending"] == 0
    assert round(summary["units_pnl"], 2) == 1.62  # 0.85 + 0.77
    assert summary["by_tier"]["official_pick"]["settled"] == 1
    assert summary["by_tier"]["lean"]["settled"] == 1


def test_render_report_is_honest_about_pending_and_basis() -> None:
    picks = extract_picks_from_slate(_slate(), recorded_at="2026-05-28T12:00:00Z")
    # Nothing settled yet: report must not imply any profit.
    summary = summarize_record(picks)
    text = render_record_report(summary, new_pick_count=2)

    assert "forward" in text.lower()  # labels itself as a forward log, not backtest
    assert "2" in text  # new picks / pending count surfaced
    # With zero settled, no win-rate/ROI number should be fabricated.
    assert "pending" in text.lower()
