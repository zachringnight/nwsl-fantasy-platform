# Forward pick-log audit, 2026-08-06

Audit of the live forward pick log (`data/processed/pick_ledger.csv`) after 10 weeks
of accrual. Everything below is computed from the locked ledger and the odds store.
No re-simulation, no re-pricing, no dropped rows.

**Bottom line: the log is losing money, and it is still too small to prove the model
is broken. CLV, the metric that would settle it sooner, is not yet conclusive either.
The correct action is to fix CLV measurement, not to tune thresholds.**

## Sample

| | |
|---|---|
| locked picks | 31 (all `lean` tier) |
| settled | 23 (22 win/loss, 1 push) |
| pending | 8 |
| P&L | -7.91u on 23u staked, ROI -34.4% |
| window | 2026-05-28 to 2026-08-05 |

## 1. Calibration on the picks actually made

Model probability reconstructed as `1/odds + prob_edge` (the ledger stores
`prob_edge` against the no-vig line). Raw implied slightly overstates no-vig, so this
is a *conservative* read of overconfidence.

| model prob bucket | n | predicted win% | actual win% | 95% CI (Wilson) | verdict |
|---|---|---|---|---|---|
| <40% | 7 | 29.8 | 0.0 | [0.0, 35.4] | consistent |
| 40-50% | 2 | 47.0 | 50.0 | [9.5, 90.5] | consistent |
| 50-60% | 7 | 55.6 | 42.9 | [15.8, 75.0] | consistent |
| >=60% | 6 | 65.3 | 50.0 | [18.8, 81.2] | consistent |
| **all** | **22** | **49.2** | **31.8** | **[16.4, 52.7]** | |

The model expected ~10.8 wins from 22 picks and got 7. Binomial tail against its own
stated probabilities: **p = 0.077**. Every individual bucket is consistent with its
confidence interval.

**Read:** directionally overconfident, not statistically separable from variance at
n=22. Do not conclude the model is broken from this. Do not conclude it is fine either.

## 2. CLV on the picks actually made

Locked price vs closing price, using both `odds_normalized.csv` (source_type=close)
and freshly materialized `closing_odds.csv`.

| | |
|---|---|
| settled picks matched to a close | 14 of 23 |
| mean CLV | +1.57pp |
| beat the close | 9/14 (64%) |
| 95% CI on mean CLV | **[-0.53pp, +3.66pp]** |

**The interval includes zero.** Mean CLV is mildly positive but not distinguishable
from no edge. This is "cannot tell yet", not "we are beating the close".

Note the earlier league-wide `report_clv.py` number (mean -0.22% across all captured
sides) answers a different question: it measures line movement on everything priced,
not on the picks the model chose.

## 3. Where the money went

By market:

| market | n | W-L-P | P&L | ROI |
|---|---|---|---|---|
| 1x2 | 12 | 2-10-0 | -6.90u | -57.5% |
| total | 11 | 5-5-1 | -1.01u | -9.2% |

By market and side:

| | n | W-L-P | P&L | ROI |
|---|---|---|---|---|
| 1x2 draw | 4 | 0-4-0 | -4.00u | -100.0% |
| 1x2 home | 4 | 1-3-0 | -2.15u | -53.8% |
| 1x2 away | 4 | 1-3-0 | -0.75u | -18.8% |
| total over | 11 | 5-5-1 | -1.01u | -9.2% |

By claimed edge size (note the inversion):

| claimed edge | n | W-L-P | P&L | ROI |
|---|---|---|---|---|
| 3-6pp | 8 | 1-7-0 | -6.14u | -76.8% |
| 6-10pp | 10 | 4-5-1 | -1.56u | -15.6% |
| 10pp+ | 5 | 2-3-0 | -0.21u | -4.2% |

The *marginal* picks are the losers. The high-conviction ones roughly broke even.
That is the shape you would expect if `lean_min_edge = 0.01` is too loose, but 8 picks
is not enough to act on.

## 4. Why no official-tier pick has ever fired

This is not a mis-set threshold. Two deliberate gates, confirmed in
`src/betting/recommendations.py` and `configs/default.yaml`:

1. **1x2:** `gating_status != "passed"`, so `official_eligible` is False regardless of
   edge. The model has never cleared promotion gates. Reject reason
   `lean_model_gating_not_passed`.
2. **Totals:** `official_picks_enabled: false` in config, by design, until totals
   calibration is independently validated. Reject reason
   `lean_market_official_picks_disabled`.

Every actionable idea therefore falls through to the lean path, which requires only
`lean_min_edge = 0.01` and `lean_min_confidence = 0.03`.

Worth knowing: the lean path computes
`min_required_edge = min(rule.min_edge, lean_min_edge)`, so **market and side specific
official thresholds are bypassed for leans**. The hardened draw rule
(`min_edge: 0.12`, `min_probability_edge: 0.12`) never constrains a draw lean. Draw
leans are 0-4. The config comment says draws should stay leans unless they clear a much
larger edge, so this is arguably intended, but the forward log is the first evidence of
what it costs. Price bounds (`min_market_price`, `max_market_price`) and `allowed_sides`
*are* enforced for leans.

## 5. Recommendation

**Do not tune thresholds on 22 graded picks.** Raising `lean_min_edge` to 0.06 or
dropping draw leans would both look great in hindsight on this exact sample and is
textbook curve-fitting. The honest state is "not enough evidence".

Do this instead, in order:

1. **Close the CLV measurement gap.** 9 of 23 settled picks have no closing price. The
   cause is structural: `scripts/materialize_closing_odds.py` writes
   `data/raw/closing_odds.csv`, and *nothing consumes it*. It is not called by
   `track_matchday_cron.sh`, and `normalize_odds.py` reads only `data/raw/odds.csv`.
   Close rows in the odds store come from lagging OddsPortal historical scrapes.
   Wiring materialized closes into the odds pipeline is the single highest-value fix,
   because CLV converges on far fewer samples than ROI.
2. **Then let CLV be the decision metric.** Revisit when the CLV interval excludes
   zero in either direction, or at roughly 100 settled picks.
3. **Only then** revisit `lean_min_edge` and the draw-lean bypass, with the threshold
   sweep in `scripts/analyze_betting_thresholds.py` run out-of-sample.

## Caveats

- 23 settled picks. Every number here has wide error bars.
- CLV coverage is 14/23 and the matched subset may not be representative.
- Ledger P&L treats each lean as 1 flat unit. Configured lean staking is
  `lean_max_stake_pct = 0.001` versus `max_stake_pct = 0.01` for official picks, so
  -7.91u is a per-bet ROI measure, not a bankroll drawdown.
