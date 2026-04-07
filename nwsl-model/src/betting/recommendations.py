"""Shared live/backtest bet selection rules."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any, Iterable

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.staking import BetRecommendation, StakingEngine
from src.utils.math_utils import decimal_from_probability


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
    allowed_markets = betting_cfg.get("allowed_markets") or betting_cfg.get("markets") or ["1x2", "total"]
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
    return parsed


def _confidence_band(score: float) -> str:
    if score >= 0.15:
        return "high"
    if score >= 0.08:
        return "medium"
    return "low"


def _confidence_score(market_type: str, probability: float) -> float:
    if market_type == "1x2":
        return max(probability - (1.0 / 3.0), 0.0)
    return max(abs(probability - 0.5), 0.0)


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

        if market_type not in selection.allowed_markets:
            continue

        if source_type == "current" and timestamp is not None:
            age_minutes = (current_time - timestamp).total_seconds() / 60.0
            if age_minutes > selection.stale_line_minutes:
                if market_type == "1x2":
                    for side, probability in (
                        ("home", markets.home_prob),
                        ("draw", markets.draw_prob),
                        ("away", markets.away_prob),
                    ):
                        decisions.append(
                            _reject(
                                match_id=match_id,
                                market=f"1x2_{side}",
                                side=side,
                                line=None,
                                sportsbook=sportsbook,
                                source_type=source_type,
                                timestamp=timestamp_text,
                                model_probability=float(probability),
                                model_price=float(decimal_from_probability(probability)),
                                market_price=float(getattr(row, f"{side}_odds", 0.0) or 0.0),
                                edge=0.0,
                                confidence=_confidence_score("1x2", float(probability)),
                                slate_key=slate_key,
                                model_version=model_version,
                                model_family=model_family,
                                blended=blended,
                                gating_status=gating_status,
                                reason="stale_line",
                            )
                        )
                else:
                    for side, probability, price in (
                        ("over", markets.over_probs.get(float(getattr(row, "line", 0.0)), 0.0), getattr(row, "over_odds", 0.0)),
                        ("under", markets.under_probs.get(float(getattr(row, "line", 0.0)), 0.0), getattr(row, "under_odds", 0.0)),
                    ):
                        decisions.append(
                            _reject(
                                match_id=match_id,
                                market=f"total_{side}_{getattr(row, 'line', 0.0)}",
                                side=side,
                                line=float(getattr(row, "line", 0.0)),
                                sportsbook=sportsbook,
                                source_type=source_type,
                                timestamp=timestamp_text,
                                model_probability=float(probability),
                                model_price=float(decimal_from_probability(probability)) if probability else 0.0,
                                market_price=float(price or 0.0),
                                edge=0.0,
                                confidence=_confidence_score("total", float(probability)),
                                slate_key=slate_key,
                                model_version=model_version,
                                model_family=model_family,
                                blended=blended,
                                gating_status=gating_status,
                                reason="stale_line",
                            )
                        )
                continue

        if market_type == "1x2":
            opportunities: Iterable[tuple[str, float, float]] = (
                ("home", float(markets.home_prob), float(getattr(row, "home_odds", 0.0) or 0.0)),
                ("draw", float(markets.draw_prob), float(getattr(row, "draw_odds", 0.0) or 0.0)),
                ("away", float(markets.away_prob), float(getattr(row, "away_odds", 0.0) or 0.0)),
            )
            for side, probability, market_price in opportunities:
                confidence = _confidence_score("1x2", probability)
                edge = probability * market_price - 1.0 if market_price > 1.0 else 0.0
                if market_price <= 1.0:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"1x2_{side}",
                            side=side,
                            line=None,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="missing_market_price",
                        )
                    )
                    continue
                if confidence < selection.min_confidence:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"1x2_{side}",
                            side=side,
                            line=None,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="confidence_below_threshold",
                        )
                    )
                    continue
                recommendation = staker.recommend_bet(match_id, f"1x2_{side}", side, probability, market_price)
                if recommendation is None:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"1x2_{side}",
                            side=side,
                            line=None,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="edge_below_threshold",
                        )
                    )
                    continue
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
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=recommendation.market,
                            side=side,
                            line=None,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(recommendation.fair_odds),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="slate_exposure_cap",
                        )
                    )
                    continue
                staker.reserve_exposure(slate_key, recommendation.stake)
                decisions.append(
                    BetDecision(
                        match_id=match_id,
                        market=recommendation.market,
                        side=side,
                        line=None,
                        sportsbook=sportsbook,
                        source_type=source_type,
                        timestamp=timestamp_text,
                        model_probability=probability,
                        model_price=float(recommendation.fair_odds),
                        market_price=market_price,
                        edge=edge,
                        confidence=confidence,
                        confidence_band=recommendation.confidence_band,
                        accepted=True,
                        reason="accepted",
                        stake=float(recommendation.stake),
                        stake_pct=float(recommendation.stake_pct),
                        slate_key=slate_key,
                        model_version=model_version,
                        model_family=model_family,
                        blended=blended,
                        gating_status=gating_status,
                    )
                )
        elif market_type == "total":
            line = float(getattr(row, "line", 0.0) or 0.0)
            if line not in markets.over_probs:
                for side, market_price in (
                    ("over", float(getattr(row, "over_odds", 0.0) or 0.0)),
                    ("under", float(getattr(row, "under_odds", 0.0) or 0.0)),
                ):
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"total_{side}_{line}",
                            side=side,
                            line=line,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=0.0,
                            model_price=0.0,
                            market_price=market_price,
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

            opportunities = (
                ("over", float(markets.over_probs[line]), float(getattr(row, "over_odds", 0.0) or 0.0)),
                ("under", float(markets.under_probs[line]), float(getattr(row, "under_odds", 0.0) or 0.0)),
            )
            for side, probability, market_price in opportunities:
                confidence = _confidence_score("total", probability)
                edge = probability * market_price - 1.0 if market_price > 1.0 else 0.0
                if market_price <= 1.0:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"total_{side}_{line}",
                            side=side,
                            line=line,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="missing_market_price",
                        )
                    )
                    continue
                if confidence < selection.min_confidence:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"total_{side}_{line}",
                            side=side,
                            line=line,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="confidence_below_threshold",
                        )
                    )
                    continue
                recommendation = staker.recommend_bet(
                    match_id,
                    f"total_{side}_{line}",
                    side,
                    probability,
                    market_price,
                    line=line,
                )
                if recommendation is None:
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=f"total_{side}_{line}",
                            side=side,
                            line=line,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(decimal_from_probability(probability)),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="edge_below_threshold",
                        )
                    )
                    continue
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
                    decisions.append(
                        _reject(
                            match_id=match_id,
                            market=recommendation.market,
                            side=side,
                            line=line,
                            sportsbook=sportsbook,
                            source_type=source_type,
                            timestamp=timestamp_text,
                            model_probability=probability,
                            model_price=float(recommendation.fair_odds),
                            market_price=market_price,
                            edge=edge,
                            confidence=confidence,
                            slate_key=slate_key,
                            model_version=model_version,
                            model_family=model_family,
                            blended=blended,
                            gating_status=gating_status,
                            reason="slate_exposure_cap",
                        )
                    )
                    continue
                staker.reserve_exposure(slate_key, recommendation.stake)
                decisions.append(
                    BetDecision(
                        match_id=match_id,
                        market=recommendation.market,
                        side=side,
                        line=line,
                        sportsbook=sportsbook,
                        source_type=source_type,
                        timestamp=timestamp_text,
                        model_probability=probability,
                        model_price=float(recommendation.fair_odds),
                        market_price=market_price,
                        edge=edge,
                        confidence=confidence,
                        confidence_band=recommendation.confidence_band,
                        accepted=True,
                        reason="accepted",
                        stake=float(recommendation.stake),
                        stake_pct=float(recommendation.stake_pct),
                        slate_key=slate_key,
                        model_version=model_version,
                        model_family=model_family,
                        blended=blended,
                        gating_status=gating_status,
                    )
                )

    return decisions
