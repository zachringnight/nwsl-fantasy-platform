# NWSL Season Validation Protocol

The operating model should not treat all historical NWSL seasons as equally current. Roster churn, expansion teams, and coaching changes mean last season is useful for structure and priors, but current-season results should dominate live pricing.

## Lanes

1. `research_2025`
   - Fit and walk-forward test only 2025 matches.
   - Use this lane to choose model family, feature definitions, calibration method, market devig, edge thresholds, and staking rules.
   - Do not use 2026 results while making these choices.

2. `transfer_2026`
   - Freeze the design selected from `research_2025`.
   - Evaluate on completed 2026 matches as the out-of-season transfer test.
   - Treat this as the first honest read on whether the design survives roster churn.

3. `live_2026`
   - Fit live prices with 2026 completed matches as the main signal.
   - Use 2025 only as weak prior context for league scoring environment, home advantage, draw rate, calibration shape, and cold starts.
   - Do not let 2025 team strength dominate 2026 team strength.

## Weighting Policy

Recommended starting point:

- 2026 completed match rows: full weight.
- 2025 match rows: no direct team-strength weight in the live lane, or at most `0.15-0.25` if a pooled model needs more stability.
- 2025 team/player priors: allowed only as shrinkage or cold-start inputs.
- Expansion teams: initialize near league average unless 2026 results or market prices justify a deviation.

## Promotion Rule

A model is not bet-ready just because it performs inside 2025. It must pass:

- 2025 walk-forward research checks.
- Frozen 2026 transfer validation.
- Historical odds profitability audit on the same markets it will bet live.
- Current live-odds availability and gating.

If 2025 research and 2026 transfer disagree, trust the 2026 transfer result for live deployment and use the disagreement to revise the next research cycle.
