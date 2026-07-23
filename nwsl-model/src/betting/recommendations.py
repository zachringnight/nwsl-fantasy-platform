"""Shared live/backtest bet selection rules."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.betting.market_derivation import MarketPrices
from src.betting.staking import StakingEngine
from src.utils.math_utils import decimal_from_probability

UTC = timezone.utc


@dataclass
class MarketRuleConfig:
    min_edge: float
    min_confidence: float
    enabled: bool = True
    # When False the market may still surface leans but never official picks.
    # Used to keep a market actionable (lean tier) while its market-specific
    # validation/calibration has not yet cleared the official-pick gate.
    official_picks_enabled: bool = True
    min_market_price: float | None = None
    max_market_price: float | None = None
    min_probability_edge: float | None = None
    max_probability_edge: float | None = None
    allowed_sides: tuple[str, ...] = ()


@dataclass
class BetSelectionConfig:
    min_edge: float = 0.02
    min_confidence: float = 0.08
    allow_leans: bool = True
    lean_min_edge: float = 0.01
    lean_min_confidence: float = 0.03
    lean_max_probability_edge: float = 0.20
    lean_kelly_fraction: float = 0.10
    lean_max_stake_pct: float = 0.001
    stale_line_minutes: int = 180
    allowed_markets: tuple[str, ...] = ("1x2", "total")
    moneyline_min_edge: float | None = None
    moneyline_min_confidence: float | None = None
    moneyline_enabled: bool = True
    moneyline_official_picks_enabled: bool = True
    moneyline_min_market_price: float | None = None
    moneyline_max_market_price: float | None = None
    moneyline_min_probability_edge: float | None = None
    moneyline_max_probability_edge: float | None = None
    moneyline_allowed_sides: tuple[str, ...] = ()
    moneyline_side_rules: dict[str, dict[str, Any]] = field(default_factory=dict)
    total_min_edge: float | None = None
    total_min_confidence: float | None = None
    total_enabled: bool = True
    total_official_picks_enabled: bool = True
    total_min_market_price: float | None = None
    total_max_market_price: float | None = None
    total_min_probability_edge: float | None = None
    total_max_probability_edge: float | None = None
    total_allowed_sides: tuple[str, ...] = ()
    total_side_rules: dict[str, dict[str, Any]] = field(default_factory=dict)

    @staticmethod
    def _with_side_overrides(
        base: MarketRuleConfig,
        overrides: dict[str, Any] | None,
    ) -> MarketRuleConfig:
        if not overrides:
            return base

        def optional_float(key: str, fallback: float | None) -> float | None:
            value = overrides.get(key, fallback)
            if value is None or value == "":
                return None
            return float(value)

        raw_sides = overrides.get("allowed_sides", overrides.get("sides", base.allowed_sides))
        allowed_sides = tuple(
            dict.fromkeys(str(item).strip().lower() for item in raw_sides if str(item).strip())
        )
        return MarketRuleConfig(
            min_edge=float(overrides.get("min_edge", base.min_edge)),
            min_confidence=float(overrides.get("min_confidence", base.min_confidence)),
            enabled=bool(overrides.get("enabled", base.enabled)),
            official_picks_enabled=bool(
                overrides.get("official_picks_enabled", base.official_picks_enabled)
            ),
            min_market_price=optional_float("min_market_price", base.min_market_price),
            max_market_price=optional_float("max_market_price", base.max_market_price),
            min_probability_edge=optional_float("min_probability_edge", base.min_probability_edge),
            max_probability_edge=optional_float("max_probability_edge", base.max_probability_edge),
            allowed_sides=allowed_sides,
        )

    def rule_for(self, market_type: str, side: str | None = None) -> MarketRuleConfig:
        if market_type == "1x2":
            base = MarketRuleConfig(
                min_edge=float(self.moneyline_min_edge if self.moneyline_min_edge is not None else self.min_edge),
                min_confidence=float(
                    self.moneyline_min_confidence
                    if self.moneyline_min_confidence is not None
                    else self.min_confidence
                ),
                enabled=self.moneyline_enabled,
                official_picks_enabled=self.moneyline_official_picks_enabled,
                min_market_price=self.moneyline_min_market_price,
                max_market_price=self.moneyline_max_market_price,
                min_probability_edge=self.moneyline_min_probability_edge,
                max_probability_edge=self.moneyline_max_probability_edge,
                allowed_sides=self.moneyline_allowed_sides,
            )
            return self._with_side_overrides(
                base,
                self.moneyline_side_rules.get(str(side).strip().lower()) if side is not None else None,
            )
        if market_type == "total":
            base = MarketRuleConfig(
                min_edge=float(self.total_min_edge if self.total_min_edge is not None else self.min_edge),
                min_confidence=float(
                    self.total_min_confidence
                    if self.total_min_confidence is not None
                    else self.min_confidence
                ),
                enabled=self.total_enabled,
                official_picks_enabled=self.total_official_picks_enabled,
                min_market_price=self.total_min_market_price,
                max_market_price=self.total_max_market_price,
                min_probability_edge=self.total_min_probability_edge,
                max_probability_edge=self.total_max_probability_edge,
                allowed_sides=self.total_allowed_sides,
            )
            return self._with_side_overrides(
                base,
                self.total_side_rules.get(str(side).strip().lower()) if side is not None else None,
            )
        return MarketRuleConfig(min_edge=self.min_edge, min_confidence=self.min_confidence)


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
    market_no_vig_probability: float
    probability_edge: float
    expected_value: float
    closing_market_price: float
    clv: float
    edge: float
    confidence: float
    confidence_band: str
    pick_tier: str
    actionable: bool
    accepted: bool
    reason: str
    stake: float = 0.0
    stake_pct: float = 0.0
    slate_key: str = ""
    model_version: str = ""
    model_family: str = ""
    blended: bool = False
    gating_status: str = "unknown"
    fold_id: int | None = None
    match_date: str = ""

    def to_record(self) -> dict[str, Any]:
        return asdict(self)


def load_bet_selection_config(config: dict[str, Any]) -> BetSelectionConfig:
    betting_cfg = config.get("betting", {})
    raw_markets = (
        betting_cfg.get("allowed_markets")
        or betting_cfg.get("markets")
        or ["1x2", "total"]
    )
    odds_cfg = config.get("odds_provider", {})

    aliases = {
        "ml": "1x2",
        "moneyline": "1x2",
        "money_line": "1x2",
        "h2h": "1x2",
        "match_winner": "1x2",
        "totals": "total",
        "total_goals": "total",
        "over_under": "total",
        "ou": "total",
    }
    allowed_markets = []
    for item in raw_markets:
        market = str(item).strip().lower()
        allowed_markets.append(aliases.get(market, market))

    market_rules = betting_cfg.get("market_rules", {}) or {}
    moneyline_cfg = {
        **(market_rules.get("moneyline", {}) or {}),
        **(market_rules.get("1x2", {}) or {}),
    }
    total_cfg = {
        **(market_rules.get("total", {}) or {}),
        **(market_rules.get("totals", {}) or {}),
    }

    def _optional_float(source: dict[str, Any], key: str) -> float | None:
        value = source.get(key)
        if value is None or value == "":
            return None
        return float(value)

    def _sides(source: dict[str, Any]) -> tuple[str, ...]:
        raw = source.get("allowed_sides") or source.get("sides") or []
        return tuple(dict.fromkeys(str(item).strip().lower() for item in raw if str(item).strip()))

    def _side_rules(source: dict[str, Any]) -> dict[str, dict[str, Any]]:
        raw = source.get("side_rules") or {}
        if not isinstance(raw, dict):
            return {}
        allowed_keys = {
            "enabled",
            "official_picks_enabled",
            "min_edge",
            "min_confidence",
            "min_market_price",
            "max_market_price",
            "min_probability_edge",
            "max_probability_edge",
            "allowed_sides",
            "sides",
        }
        side_rules: dict[str, dict[str, Any]] = {}
        for side, payload in raw.items():
            if not isinstance(payload, dict):
                continue
            side_key = str(side).strip().lower()
            if not side_key:
                continue
            side_rules[side_key] = {
                key: value
                for key, value in payload.items()
                if key in allowed_keys
            }
        return side_rules

    return BetSelectionConfig(
        min_edge=float(betting_cfg.get("min_edge", 0.02)),
        min_confidence=float(betting_cfg.get("min_confidence", 0.08)),
        allow_leans=bool(betting_cfg.get("allow_leans", True)),
        lean_min_edge=float(betting_cfg.get("lean_min_edge", 0.01)),
        lean_min_confidence=float(betting_cfg.get("lean_min_confidence", 0.03)),
        lean_max_probability_edge=float(betting_cfg.get("lean_max_probability_edge", 0.20)),
        lean_kelly_fraction=float(betting_cfg.get("lean_kelly_fraction", 0.10)),
        lean_max_stake_pct=float(betting_cfg.get("lean_max_stake_pct", 0.001)),
        stale_line_minutes=int(odds_cfg.get("stale_line_minutes", 180)),
        allowed_markets=tuple(dict.fromkeys(allowed_markets)),
        moneyline_min_edge=_optional_float(moneyline_cfg, "min_edge"),
        moneyline_min_confidence=_optional_float(moneyline_cfg, "min_confidence"),
        moneyline_enabled=bool(moneyline_cfg.get("enabled", True)),
        moneyline_official_picks_enabled=bool(moneyline_cfg.get("official_picks_enabled", True)),
        moneyline_min_market_price=_optional_float(moneyline_cfg, "min_market_price"),
        moneyline_max_market_price=_optional_float(moneyline_cfg, "max_market_price"),
        moneyline_min_probability_edge=_optional_float(moneyline_cfg, "min_probability_edge"),
        moneyline_max_probability_edge=_optional_float(moneyline_cfg, "max_probability_edge"),
        moneyline_allowed_sides=_sides(moneyline_cfg),
        moneyline_side_rules=_side_rules(moneyline_cfg),
        total_min_edge=_optional_float(total_cfg, "min_edge"),
        total_min_confidence=_optional_float(total_cfg, "min_confidence"),
        total_enabled=bool(total_cfg.get("enabled", True)),
        total_official_picks_enabled=bool(total_cfg.get("official_picks_enabled", True)),
        total_min_market_price=_optional_float(total_cfg, "min_market_price"),
        total_max_market_price=_optional_float(total_cfg, "max_market_price"),
        total_min_probability_edge=_optional_float(total_cfg, "min_probability_edge"),
        total_max_probability_edge=_optional_float(total_cfg, "max_probability_edge"),
        total_allowed_sides=_sides(total_cfg),
        total_side_rules=_side_rules(total_cfg),
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


def _devig(prices: list[float | None]) -> list[float | None]:
    valid_prices = [float(price) for price in prices if price is not None and float(price) > 1.0]
    if len(valid_prices) != len(prices):
        return [None for _ in prices]
    implied = [1.0 / price for price in valid_prices]
    total = sum(implied)
    if total <= 0:
        return [None for _ in prices]
    return [probability / total for probability in implied]


def _expected_value(probability: float, market_price: float | None) -> float:
    if market_price is None or market_price <= 1.0:
        return 0.0
    return float(probability) * float(market_price) - 1.0


def _clv(bet_price: float | None, closing_price: float | None) -> float:
    if bet_price is None or closing_price is None or bet_price <= 1.0 or closing_price <= 1.0:
        return 0.0
    return float(bet_price) / float(closing_price) - 1.0


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
    market_no_vig_probability: float,
    probability_edge: float,
    expected_value: float,
    closing_market_price: float,
    clv: float,
    edge: float,
    confidence: float,
    pick_tier: str = "no_bet",
    actionable: bool = False,
    slate_key: str,
    model_version: str,
    model_family: str,
    blended: bool,
    gating_status: str,
    reason: str,
    stake: float = 0.0,
    stake_pct: float = 0.0,
    fold_id: int | None = None,
    match_date: str = "",
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
        market_no_vig_probability=market_no_vig_probability,
        probability_edge=probability_edge,
        expected_value=expected_value,
        closing_market_price=closing_market_price,
        clv=clv,
        edge=edge,
        confidence=confidence,
        confidence_band=_confidence_band(confidence),
        pick_tier=pick_tier,
        actionable=actionable,
        accepted=False,
        reason=reason,
        stake=stake,
        stake_pct=stake_pct,
        slate_key=slate_key,
        model_version=model_version,
        model_family=model_family,
        blended=blended,
        gating_status=gating_status,
        fold_id=fold_id,
        match_date=match_date,
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
    no_vig_probability: float | None,
    closing_market_price: float | None,
    staker: StakingEngine,
    selection: BetSelectionConfig,
    model_version: str,
    model_family: str,
    blended: bool,
    gating_status: str,
    fold_id: int | None = None,
    match_date: str = "",
) -> None:
    model_price = float(decimal_from_probability(probability))
    confidence = _confidence_score(market_type, probability)
    edge = staker.compute_edge(probability, market_price) if market_price else 0.0
    probability_edge = float(probability - no_vig_probability) if no_vig_probability is not None else 0.0
    expected_value = _expected_value(probability, market_price)
    closing_price = float(closing_market_price or market_price or 0.0)
    clv = _clv(market_price, closing_price)
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
        "market_no_vig_probability": float(no_vig_probability or 0.0),
        "probability_edge": probability_edge,
        "expected_value": expected_value,
        "closing_market_price": closing_price,
        "clv": clv,
        "edge": float(edge),
        "confidence": float(confidence),
        "slate_key": slate_key,
        "model_version": model_version,
        "model_family": model_family,
        "blended": blended,
        "gating_status": gating_status,
        "fold_id": fold_id,
        "match_date": match_date,
    }
    if market_price is None:
        decisions.append(_reject(**base, reason="missing_market_price"))
        return
    if no_vig_probability is None:
        decisions.append(_reject(**base, reason="incomplete_market"))
        return
    rule = selection.rule_for(market_type, side)
    if not rule.enabled:
        decisions.append(_reject(**base, reason="market_disabled_by_validation"))
        return
    if rule.allowed_sides and side.lower() not in rule.allowed_sides:
        decisions.append(_reject(**base, reason="side_not_allowed"))
        return
    if rule.min_market_price is not None and float(market_price) < float(rule.min_market_price):
        decisions.append(_reject(**base, reason="market_price_below_min"))
        return
    if rule.max_market_price is not None and float(market_price) > float(rule.max_market_price):
        decisions.append(_reject(**base, reason="market_price_above_max"))
        return
    min_required_confidence = min(rule.min_confidence, selection.lean_min_confidence) if selection.allow_leans else rule.min_confidence
    min_required_edge = min(rule.min_edge, selection.lean_min_edge) if selection.allow_leans else rule.min_edge
    if confidence < min_required_confidence:
        decisions.append(_reject(**base, reason="confidence_below_threshold"))
        return
    if edge < min_required_edge:
        decisions.append(_reject(**base, reason="edge_below_threshold"))
        return

    probability_edge_allowed = (
        rule.max_probability_edge is None
        or probability_edge <= float(rule.max_probability_edge)
    )
    probability_edge_min_met = (
        rule.min_probability_edge is None
        or probability_edge >= float(rule.min_probability_edge)
    )
    official_eligible = (
        rule.official_picks_enabled
        and str(gating_status).lower() == "passed"
        and confidence >= rule.min_confidence
        and edge >= rule.min_edge
        and probability_edge_min_met
        and probability_edge_allowed
    )
    if not official_eligible and selection.allow_leans:
        if probability_edge > selection.lean_max_probability_edge:
            decisions.append(_reject(**base, reason="lean_probability_edge_outlier"))
            return
        full_kelly = staker.kelly_stake(probability, market_price)
        stake_pct = min(full_kelly * selection.lean_kelly_fraction, selection.lean_max_stake_pct)
        reason = "lean"
        if not rule.official_picks_enabled:
            reason = "lean_market_official_picks_disabled"
        elif str(gating_status).lower() != "passed":
            reason = "lean_model_gating_not_passed"
        elif confidence < rule.min_confidence:
            reason = "lean_confidence_below_official_threshold"
        elif edge < rule.min_edge:
            reason = "lean_edge_below_official_threshold"
        elif not probability_edge_min_met:
            reason = "lean_probability_edge_below_official_threshold"
        elif not probability_edge_allowed:
            reason = "lean_probability_edge_outlier"
        decisions.append(
            _reject(
                **base,
                reason=reason,
                pick_tier="lean",
                actionable=True,
                stake=float(stake_pct * staker.bankroll),
                stake_pct=float(stake_pct),
            )
        )
        return

    if not rule.official_picks_enabled:
        decisions.append(_reject(**base, reason="official_picks_disabled"))
        return
    if confidence < rule.min_confidence:
        decisions.append(_reject(**base, reason="confidence_below_threshold"))
        return
    if str(gating_status).lower() != "passed":
        decisions.append(_reject(**base, reason="model_gating_not_passed"))
        return
    if not probability_edge_min_met:
        decisions.append(_reject(**base, reason="probability_edge_below_threshold"))
        return
    if not probability_edge_allowed:
        decisions.append(_reject(**base, reason="probability_edge_outlier"))
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
    recommendation.market_no_vig_probability = float(no_vig_probability or 0.0)
    recommendation.probability_edge = probability_edge
    recommendation.expected_value = expected_value
    recommendation.closing_market_odds = closing_price
    recommendation.clv = clv
    recommendation.confidence = confidence
    recommendation.confidence_band = _confidence_band(confidence)
    recommendation.slate_key = slate_key
    recommendation.model_version = model_version
    recommendation.model_family = model_family
    recommendation.blended = blended
    recommendation.gating_status = gating_status
    recommendation.pick_tier = "official_pick"
    recommendation.actionable = True

    if not staker.can_allocate(slate_key, recommendation.stake):
        decisions.append(_reject(**base, reason="slate_exposure_cap"))
        return

    staker.reserve_exposure(slate_key, recommendation.stake)
    decisions.append(
        BetDecision(
            **base,
            confidence_band=recommendation.confidence_band,
            pick_tier="official_pick",
            actionable=True,
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
    fold_id: int | None = None,
    match_date: str = "",
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
            market_type == "1x2"
            or (
                market_type == ""
                and all(hasattr(row, col) for col in ("home_odds", "draw_odds", "away_odds"))
            )
        ):
            home_price = _safe_float(getattr(row, "home_odds", None))
            draw_price = _safe_float(getattr(row, "draw_odds", None))
            away_price = _safe_float(getattr(row, "away_odds", None))
            no_vig = _devig([home_price, draw_price, away_price])
            opportunities = [
                ("home", markets.home_prob, home_price, no_vig[0]),
                ("draw", markets.draw_prob, draw_price, no_vig[1]),
                ("away", markets.away_prob, away_price, no_vig[2]),
            ]
            for side, probability, price, no_vig_probability in opportunities:
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
                    no_vig_probability=no_vig_probability,
                    closing_market_price=price if source_type == "close" else None,
                    staker=staker,
                    selection=selection,
                    model_version=model_version,
                    model_family=model_family,
                    blended=blended,
                    gating_status=gating_status,
                    fold_id=fold_id,
                    match_date=match_date,
                )

        if "total" in selection.allowed_markets and (
            market_type in {"total", "totals"}
            or (
                market_type == ""
                and (hasattr(row, "total_line") or hasattr(row, "line"))
            )
        ):
            raw_line = getattr(row, "total_line", None)
            if raw_line is None or pd.isna(raw_line):
                raw_line = getattr(row, "line", None)
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
                        market_no_vig_probability=0.0,
                        probability_edge=0.0,
                        expected_value=0.0,
                        closing_market_price=0.0,
                        clv=0.0,
                        edge=0.0,
                        confidence=0.0,
                        slate_key=slate_key,
                        model_version=model_version,
                        model_family=model_family,
                        blended=blended,
                        gating_status=gating_status,
                        reason="unsupported_total_line",
                        fold_id=fold_id,
                        match_date=match_date,
                    )
                )
                continue

            over_price = _safe_float(getattr(row, "over_odds", None))
            under_price = _safe_float(getattr(row, "under_odds", None))
            no_vig = _devig([over_price, under_price])
            for side, probability, price in [
                ("over", markets.over_probs[line], over_price),
                ("under", markets.under_probs[line], under_price),
            ]:
                no_vig_probability = no_vig[0] if side == "over" else no_vig[1]
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
                    no_vig_probability=no_vig_probability,
                    closing_market_price=price if source_type == "close" else None,
                    staker=staker,
                    selection=selection,
                    model_version=model_version,
                    model_family=model_family,
                    blended=blended,
                    gating_status=gating_status,
                    fold_id=fold_id,
                    match_date=match_date,
                )

    return decisions
