"""Forward pick-log: lock in matchday picks, settle them, track the record.

This is a *forward* tracker, not a backtest replay. Each matchday we snapshot
the actionable picks the model is making right now with the odds it would bet
into, store them immutably (first-seen odds are locked), and grade them only
once the match has actually been played. That produces an honest real-time
record of how the model performs going forward, which the negative backtest
cannot.
"""

from __future__ import annotations

import hashlib
import re

import pandas as pd

# Token format emitted by generate_betting_slate.py recommended_bets/leans, e.g.
#   1x2_home@1.85(prob_edge=0.086,ev=0.042,stake=10.0)
#   total_over_2.5@1.77(prob_edge=0.077,ev=0.058,stake=10.0)
_PICK_TOKEN = re.compile(
    r"(?P<market>1x2|total)_(?P<side>home|draw|away|over|under)"
    r"(?:_(?P<line>[\d.]+))?@(?P<odds>[\d.]+)\((?P<params>[^)]*)\)"
)

LEDGER_COLUMNS = [
    "pick_id",
    "match_id",
    "match_date",
    "home_team",
    "away_team",
    "recorded_at",
    "tier",
    "market",
    "side",
    "line",
    "odds",
    "stake",
    "prob_edge",
    "ev",
    "model_version",
    "result",
    "pnl_per_unit",
    "settled_at",
]


def _pick_id(match_id: str, tier: str, market: str, side: str, line: float | None) -> str:
    line_key = "" if line is None or pd.isna(line) else f"{float(line):g}"
    raw = f"{match_id}|{tier}|{market}|{side}|{line_key}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _parse_params(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for part in text.split(","):
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        try:
            out[key.strip()] = float(value)
        except ValueError:
            continue
    return out


def _is_empty_token(value: object) -> bool:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return True
    return str(value).strip().lower() in {"", "none", "nan", "[]"}


def _rows_from_field(row: pd.Series, field: str, tier: str, recorded_at: str) -> list[dict]:
    value = row.get(field)
    if _is_empty_token(value):
        return []
    rows: list[dict] = []
    for match in _PICK_TOKEN.finditer(str(value)):
        market = match.group("market")
        side = match.group("side")
        line = float(match.group("line")) if match.group("line") else None
        odds = float(match.group("odds"))
        params = _parse_params(match.group("params"))
        match_id = str(row["match_id"])
        rows.append(
            {
                "pick_id": _pick_id(match_id, tier, market, side, line),
                "match_id": match_id,
                "match_date": str(row.get("match_date", "")),
                "home_team": str(row.get("home_team", "")),
                "away_team": str(row.get("away_team", "")),
                "recorded_at": recorded_at,
                "tier": tier,
                "market": market,
                "side": side,
                "line": line,
                "odds": odds,
                "stake": params.get("stake"),
                "prob_edge": params.get("prob_edge"),
                "ev": params.get("ev"),
                "model_version": str(row.get("model_version", "")),
                "result": "pending",
                "pnl_per_unit": pd.NA,
                "settled_at": pd.NA,
            }
        )
    return rows


def extract_picks_from_slate(slate: pd.DataFrame, *, recorded_at: str) -> pd.DataFrame:
    """Flatten a betting slate into one row per actionable pick.

    Official picks come from ``recommended_bets``; leans from
    ``recommended_leans``. Non-actionable (``no_bet``) rows contribute nothing.
    """
    rows: list[dict] = []
    for _, row in slate.iterrows():
        rows.extend(_rows_from_field(row, "recommended_bets", "official_pick", recorded_at))
        rows.extend(_rows_from_field(row, "recommended_leans", "lean", recorded_at))
    if not rows:
        return pd.DataFrame(columns=LEDGER_COLUMNS)
    return pd.DataFrame(rows)[LEDGER_COLUMNS]


def merge_new_picks(existing: pd.DataFrame, new_picks: pd.DataFrame) -> pd.DataFrame:
    """Append only genuinely new picks; never overwrite a locked-in pick.

    Idempotent on ``pick_id`` keeping the earliest record, so re-running on a
    later matchday with drifted odds does not duplicate rows or change the odds
    we are deemed to have bet into.
    """
    frames = [frame for frame in (existing, new_picks) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame(columns=LEDGER_COLUMNS)
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset="pick_id", keep="first").reset_index(drop=True)
    return combined[LEDGER_COLUMNS]


def _result_side(home_goals: object, away_goals: object) -> str | None:
    home = pd.to_numeric(home_goals, errors="coerce")
    away = pd.to_numeric(away_goals, errors="coerce")
    if pd.isna(home) or pd.isna(away):
        return None
    if home > away:
        return "home"
    if away > home:
        return "away"
    return "draw"


def _grade(pick: pd.Series, result_row: pd.Series | None) -> tuple[str, object]:
    """Return (result, pnl_per_unit) for a pick given its match outcome row."""
    if result_row is None:
        return "pending", pd.NA
    status = str(result_row.get("match_status", "")).strip().lower()
    home_goals = result_row.get("home_goals_90")
    away_goals = result_row.get("away_goals_90")
    if status not in {"completed", "final", "finished"} or pd.isna(pd.to_numeric(home_goals, errors="coerce")):
        return "pending", pd.NA

    market = str(pick["market"])
    side = str(pick["side"])
    if market == "1x2":
        actual = _result_side(home_goals, away_goals)
        if actual is None:
            return "pending", pd.NA
        outcome = "win" if actual == side else "loss"
    elif market == "total":
        total = pd.to_numeric(home_goals, errors="coerce") + pd.to_numeric(away_goals, errors="coerce")
        line = pd.to_numeric(pick.get("line"), errors="coerce")
        if pd.isna(line):
            return "pending", pd.NA
        if total == line:
            outcome = "push"
        elif (side == "over" and total > line) or (side == "under" and total < line):
            outcome = "win"
        else:
            outcome = "loss"
    else:
        return "pending", pd.NA

    if outcome == "push":
        return "push", 0.0
    if outcome == "loss":
        return "loss", -1.0
    return "win", float(pick["odds"]) - 1.0


def settle_picks(ledger: pd.DataFrame, matches: pd.DataFrame, *, settled_at: str | None = None) -> pd.DataFrame:
    """Grade any pending picks whose match has been played; keep settled rows."""
    if ledger.empty:
        return ledger.copy()
    out = ledger.copy()
    # Loading an all-NA ledger from CSV infers float64 for these columns, which
    # warns when we write string/result values. Force object up front.
    for column in ("result", "settled_at", "line"):
        if column in out.columns:
            out[column] = out[column].astype(object)
    if matches is not None and not matches.empty:
        results = matches.copy()
        results["match_id"] = results["match_id"].astype(str)
        results = results.drop_duplicates(subset="match_id", keep="last").set_index("match_id")
    else:
        results = pd.DataFrame()

    for idx, pick in out.iterrows():
        if str(pick.get("result", "pending")) != "pending":
            continue  # already settled, immutable
        match_id = str(pick["match_id"])
        result_row = results.loc[match_id] if (not results.empty and match_id in results.index) else None
        result, pnl = _grade(pick, result_row)
        if result != "pending":
            out.at[idx, "result"] = result
            out.at[idx, "pnl_per_unit"] = pnl
            out.at[idx, "settled_at"] = settled_at if settled_at is not None else pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    return out


def _record_for(frame: pd.DataFrame) -> dict:
    settled = frame[frame["result"].isin(["win", "loss", "push"])]
    wins = int((settled["result"] == "win").sum())
    losses = int((settled["result"] == "loss").sum())
    pushes = int((settled["result"] == "push").sum())
    pnl = float(pd.to_numeric(settled["pnl_per_unit"], errors="coerce").sum())
    decided = wins + losses
    return {
        "picks": int(len(frame)),
        "settled": int(len(settled)),
        "pending": int((frame["result"] == "pending").sum()),
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "win_rate": round(wins / decided, 4) if decided else None,
        "units_pnl": round(pnl, 4),
        "roi": round(pnl / len(settled), 4) if len(settled) else None,
    }


def summarize_record(ledger: pd.DataFrame) -> dict:
    """Cumulative flat-unit record overall, by tier, and by market."""
    if ledger.empty:
        return {"picks": 0, "settled": 0, "pending": 0, "wins": 0, "losses": 0, "pushes": 0, "win_rate": None, "units_pnl": 0.0, "roi": None, "by_tier": {}, "by_market": {}}
    summary = _record_for(ledger)
    summary["by_tier"] = {tier: _record_for(group) for tier, group in ledger.groupby("tier")}
    summary["by_market"] = {market: _record_for(group) for market, group in ledger.groupby("market")}
    return summary


def _fmt_signed(value: float) -> str:
    return f"+{value:.2f}" if value >= 0 else f"{value:.2f}"


def render_record_report(summary: dict, *, new_pick_count: int = 0) -> str:
    """Render a Slack-ready running-record summary.

    Deliberately honest: this is a *forward* pick log. When nothing is settled
    yet, no win-rate or ROI is invented; pending counts are shown plainly.
    """
    lines: list[str] = []
    lines.append("*NWSL model — forward pick log*")
    lines.append(f"{new_pick_count} new pick(s) locked this run.")

    settled = summary.get("settled", 0)
    pending = summary.get("pending", 0)
    if settled == 0:
        lines.append(f"Record: 0 settled, {pending} pending. No results graded yet (forward test just started).")
    else:
        wins = summary.get("wins", 0)
        losses = summary.get("losses", 0)
        pushes = summary.get("pushes", 0)
        win_rate = summary.get("win_rate")
        roi = summary.get("roi")
        units = summary.get("units_pnl", 0.0)
        record = f"{wins}-{losses}" + (f"-{pushes}" if pushes else "")
        wr = f"{win_rate * 100:.1f}%" if win_rate is not None else "n/a"
        roi_str = f"{roi * 100:+.1f}%" if roi is not None else "n/a"
        lines.append(
            f"Record: {record} (W-L{'-P' if pushes else ''}) | {settled} settled, {pending} pending | "
            f"win rate {wr} | {_fmt_signed(units)}u | ROI {roi_str}"
        )
        by_tier = summary.get("by_tier", {})
        for tier in ("official_pick", "lean"):
            stats = by_tier.get(tier)
            if not stats or stats.get("settled", 0) == 0:
                continue
            t_units = stats.get("units_pnl", 0.0)
            t_roi = stats.get("roi")
            t_roi_str = f"{t_roi * 100:+.1f}%" if t_roi is not None else "n/a"
            lines.append(
                f"  {tier}: {stats['wins']}-{stats['losses']} | {_fmt_signed(t_units)}u | ROI {t_roi_str}"
            )
    return "\n".join(lines)
