"""Shared live/backtest bet selection rules."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.staking import StakingEngine
from src.utils.math_utils import decimal_from_probability

UTC = timezone.utc


@dataclass
class BetSelectionConfig:
    min_edge: float = 0.02
    min_confidence: float = 0.08
    stale_line_minutes: int = 180
    allowed_markets: tuple[str, ...] = ("1x2", "total")


@dataclass
class BetDecision:
    match_id: str
    market: str
    side: str
    line: float | None
    sportsbook: str
    source_type: str
    timestamp: str | None
    model_probability: float
    model_price: float
    market_price: float
    edge: float
    confidence: float
    confidence_band: str
    accepted: bool
    reason: str
    stake: float = 0.0
    stake_pct: float = 0.0
    slate_key: str = ""
    model_version: str = ""
    model_family: str = ""
    blended: bool = False
    gating_status: str = "unknown"

    def to_record(self) -> dict[str, Any]:
        return asdict(self)


def load_bet_selection_config(config: dict[str, Any]) -> BetSelectionConfig:
    betting_cfg = config.get("betting", {})
    allowed_markets = (
        betting_cfg.get("allowed_markets")
        or betting_cfg.get("markets")
        or ["1x2", "total"]
    )
    odds_cfg = config.get("odds_provider", {})
    return BetSelectionConfig(
        min_edge=float(betting_cfg.get("min_edge", 0.02)),
        min_confidence=float(betting_cfg.get("min_confidence", 0.08)),
        stale_line_minutes=int(odds_cfg.get("stale_line_minutes", 180)),
        allowed_markets=tuple(str(item) for item in allowed_markets),
    )


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    parsed = pd.to_datetime(value, utc=True, errors="coerce")
    if pd.isna(parsed):
        return None
    if isinstance(parsed, pd.Timestamp):
        return parsed.to_pydatetime().astimezone(UTC)
    return None


def _confidence_band(score: float) -> str:
    if score >= 0.15:
        return "high"
    if score >= 0.08:
        return "medium"
    return "low"


def _confidence_score(market_type: str, probability: float) -> float:
    baseline = 1.0 / 3.0 if market_type == "1x2" else 0.5
    return max(0.0, abs(float(probability) - baseline))


def _reject(
    *,
    match_id: str,
    market: str,
    side: str,
    line: float | None,
    sportsbook: str,
    source_type: str,
    timestamp: str | None,
    model_probability: float,
    model_price: float,
    market_price: float,
    edge: float,
    confidence: float,
    slate_key: str,
    model_version: str,
    model_family: str,
    blended: bool,
    gating_status: str,
    reason: str,
) -> BetDecision:
    return BetDecision(
        match_id=match_id,
        market=market,
        side=side,
        line=line,
        sportsbook=sportsbook,
        source_type=source_type,
        timestamp=timestamp,
        model_probability=model_probability,
        model_price=model_price,
        market_price=market_price,
        edge=edge,
        confidence=confidence,
        confidence_band=_confidence_band(confidence),
        accepted=False,
        reason=reason,
        slate_key=slate_key,
        model_version=model_version,
        model_family=model_family,
        blended=blended,
        gating_status=gating_status,
    )


def _safe_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number <= 1.0:
        return None
    return number


def _append_market_decision(
    *,
    decisions: list[BetDecision],
    match_id: str,
    slate_key: str,
    sportsbook: str,
    source_type: str,
    timestamp_text: str | None,
    market: str,
    market_type: str,
    side: str,
    line: float | None,
    probability: float,
    market_price: float | None,
    staker: StakingEngine,
    selection: BetSelectionConfig,
    model_version: str,
    model_family: str,
    blended: bool,
    gating_status: str,
) -> None:
    model_price = float(decimal_from_probability(probability))
    confidence = _confidence_score(market_type, probability)
    edge = staker.compute_edge(probability, market_price) if market_price else 0.0
    base = {
        "match_id": match_id,
        "market": market,
        "side": side,
        "line": line,
        "sportsbook": sportsbook,
        "source_type": source_type,
        "timestamp": timestamp_text,
        "model_probability": float(probability),
        "model_price": model_price,
        "market_price": float(market_price or 0.0),
        "edge": float(edge),
        "confidence": float(confidence),
        "slate_key": slate_key,
        "model_version": model_version,
        "model_family": model_family,
        "blended": blended,
        "gating_status": gating_status,
    }
    if market_price is None:
        decisions.append(_reject(**base, reason="missing_market_price"))
        return
    if confidence < selection.min_confidence:
        decisions.append(_reject(**base, reason="confidence_below_threshold"))
        return
    if str(gating_status).lower() != "passed":
        decisions.append(_reject(**base, reason="model_gating_not_passed"))
        return

    recommendation = staker.recommend_bet(
        match_id,
        market,
        side,
        probability,
        market_price,
        line=line or 0.0,
    )
    if recommendation is None:
        decisions.append(_reject(**base, reason="edge_below_threshold"))
        return

    recommendation.sportsbook = sportsbook
    recommendation.source_type = source_type
    recommendation.market_timestamp = timestamp_text
    recommendation.confidence = confidence
    recommendation.confidence_band = _confidence_band(confidence)
    recommendation.slate_key = slate_key
    recommendation.model_version = model_version
    recommendation.model_family = model_family
    recommendation.blended = blended
    recommendation.gating_status = gating_status

    if not staker.can_allocate(slate_key, recommendation.stake):
        decisions.append(_reject(**base, reason="slate_exposure_cap"))
        return

    staker.reserve_exposure(slate_key, recommendation.stake)
    decisions.append(
        BetDecision(
            **base,
            confidence_band=recommendation.confidence_band,
            accepted=True,
            reason="accepted",
            stake=float(recommendation.stake),
            stake_pct=float(recommendation.stake_pct),
        )
    )


def evaluate_market_candidates(
    *,
    match_id: str,
    slate_key: str,
    odds_rows: pd.DataFrame,
    markets: MarketPrices,
    staker: StakingEngine,
    selection: BetSelectionConfig,
    now: datetime | None = None,
    model_version: str = "",
    model_family: str = "",
    blended: bool = False,
    gating_status: str = "unknown",
) -> list[BetDecision]:
    """Evaluate 1X2 and total opportunities from raw odds rows."""
    if odds_rows is None or odds_rows.empty:
        return []

    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    decisions: list[BetDecision] = []

    for row in odds_rows.itertuples(index=False):
        source_type = str(getattr(row, "source_type", "close") or "close").lower()
        market_type = str(getattr(row, "market_type", "") or "").lower()
        sportsbook = str(getattr(row, "sportsbook", "consensus") or "consensus")
        timestamp_value = getattr(row, "timestamp", None)
        timestamp = _parse_timestamp(timestamp_value)
        timestamp_text = timestamp.isoformat() if timestamp else None
        if timestamp is not None:
            age_minutes = (current_time - timestamp).total_seconds() / 60.0
            if age_minutes > selection.stale_line_minutes:
                continue

        if "1x2" in selection.allowed_markets and (
            market_type in {"", "1x2"} or all(hasattr(row, col) for col in ("home_odds", "draw_odds", "away_odds"))
        ):
            opportunities = [
                ("home", markets.home_prob, _safe_float(getattr(row, "home_odds", None))),
                ("draw", markets.draw_prob, _safe_float(getattr(row, "draw_odds", None))),
                ("away", markets.away_prob, _safe_float(getattr(row, "away_odds", None))),
            ]
            for side, probability, price in opportunities:
                _append_market_decision(
                    decisions=decisions,
                    match_id=match_id,
                    slate_key=slate_key,
                    sportsbook=sportsbook,
                    source_type=source_type,
                    timestamp_text=timestamp_text,
                    market=f"1x2_{side}",
                    market_type="1x2",
                    side=side,
                    line=None,
                    probability=float(probability),
                    market_price=price,
                    staker=staker,
                    selection=selection,
                    model_version=model_version,
                    model_family=model_family,
                    blended=blended,
                    gating_status=gating_status,
                )

        if "total" in selection.allowed_markets and (
            market_type in {"", "total"} or hasattr(row, "total_line")
        ):
            raw_line = getattr(row, "total_line", None)
            if raw_line is None or pd.isna(raw_line):
                continue
            line = float(raw_line)
            if line not in markets.over_probs or line not in markets.under_probs:
                decisions.append(
                    _reject(
                        match_id=match_id,
                        market=f"total_over_{line}",
                        side="over",
                        line=line,
                        sportsbook=sportsbook,
                        source_type=source_type,
                        timestamp=timestamp_text,
                        model_probability=0.0,
                        model_price=0.0,
                        market_price=0.0,
                        edge=0.0,
                        confidence=0.0,
                        slate_key=slate_key,
                        model_version=model_version,
                        model_family=model_family,
                        blended=blended,
                        gating_status=gating_status,
                        reason="unsupported_total_line",
                    )
                )
                continue

            for side, probability, price in [
                ("over", markets.over_probs[line], _safe_float(getattr(row, "over_odds", None))),
                ("under", markets.under_probs[line], _safe_float(getattr(row, "under_odds", None))),
            ]:
                _append_market_decision(
                    decisions=decisions,
                    match_id=match_id,
                    slate_key=slate_key,
                    sportsbook=sportsbook,
                    source_type=source_type,
                    timestamp_text=timestamp_text,
                    market=f"total_{side}_{line}",
                    market_type="total",
                    side=side,
                    line=line,
                    probability=float(probability),
                    market_price=price,
                    staker=staker,
                    selection=selection,
                    model_version=model_version,
                    model_family=model_family,
                    blended=blended,
                    gating_status=gating_status,
                )

    return decisions
