# NWSL Model Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Improve the NWSL betting model from a safe research-only projection pipeline into a validated, promotion-gated pricing system that can recommend bets only when current market odds and chronological evidence support it.

**Architecture:** Keep production safety separate from research iteration. Add artifact diagnostics first, then improve odds capture, validation, candidate modeling, score-matrix calibration, and near-term slate outputs. Every model candidate must beat the current champion/fallback on chronological backtests before it can affect bet recommendations.

**Tech Stack:** Python 3, pandas, numpy, scipy/sklearn-style utilities where already present, pytest, existing NWSL model artifact layout under `nwsl-model/data/processed/models`, Apify FootyStats odds ingestion, Vitest for TypeScript data generation.

---

## Current Baseline And Blockers

Latest serious artifact: `nwsl-model/data/processed/models/20260525T233557Z`

Current promotion blockers:
- `dixon_coles`: `research_only`
- `bivariate_poisson`: `research_only`
- Best raw 1X2 log loss is `1.0814769667951398`, which beats home-field baseline `1.0904891186672154` but does not meet the 2 percent promotion improvement threshold.
- Best raw 1X2 Brier is `0.6548853874883067`, which beats home-field baseline `0.6608288767158061` but does not meet the 2 percent promotion improvement threshold.
- Total goals MAE is about tied with the uniform/home-field baseline and does not clear the gate.
- Over 2.5 Brier is around `0.250`, above the current gate threshold of `0.24`.
- Slice stability still fails for low-confidence/early cases.
- Current odds exist only as 8 current FootyStats 1X2 rows; there is not yet a historical close-odds feed.
- xG remains unavailable from the ESPN feed.

Do not loosen gates to promote the current score models. The model has to earn promotion.

## File Structure

- Create `nwsl-model/src/backtest/diagnostics.py`
  - Artifact-level gate blocker summaries, baseline deltas, and target metrics.
- Create `nwsl-model/scripts/report_artifact_diagnostics.py`
  - CLI report for one model artifact.
- Create `nwsl-model/tests/test_backtest_diagnostics.py`
  - Regression tests for diagnostic summaries.
- Create `nwsl-model/src/odds/snapshots.py`
  - Append-only current odds snapshot history with deterministic de-duplication.
- Create `nwsl-model/scripts/append_odds_snapshot.py`
  - CLI to append `data/raw/odds.csv` into `data/raw/odds_snapshots.csv`.
- Create `nwsl-model/scripts/materialize_closing_odds.py`
  - CLI to materialize best available close odds from snapshots for completed matches.
- Create `nwsl-model/tests/test_odds_snapshots.py`
  - Snapshot and close-odds tests.
- Create `nwsl-model/src/backtest/tuning.py`
  - Chronological parameter-grid runner that writes auditable tuning results.
- Create `nwsl-model/scripts/tune_backtest.py`
  - CLI wrapper for bounded tuning sweeps.
- Create `nwsl-model/tests/test_backtest_tuning.py`
  - Tests that tuning ranks candidates without reading future rows.
- Create `nwsl-model/src/models/score_matrix_calibration.py`
  - Post-hoc score-matrix calibrator for total-goals intensity and draw inflation.
- Create `nwsl-model/tests/test_score_matrix_calibration.py`
  - Tests that calibrated matrices remain normalized and improve fitted objective on toy data.
- Create `nwsl-model/src/models/elo_baseline.py`
  - A regularized Elo-style baseline candidate that can act as a production fallback if it beats current baselines.
- Modify `nwsl-model/src/backtest/runner.py`
  - Register the Elo baseline and optional calibrated score-matrix wrapper.
- Modify `nwsl-model/configs/default.yaml`
  - Add disabled-by-default tuning/calibration/odds-snapshot settings.
- Modify `nwsl-model/src/utils/gating.py`
  - Include explicit target shortfall values in promotion summaries.
- Create `nwsl-model/scripts/generate_betting_slate.py`
  - Seven-to-fourteen-day betting slate export that requires current odds and passed gating.
- Create `nwsl-model/tests/test_betting_slate.py`
  - Tests that research-only models produce zero accepted bets and explicit no-bet reasons.

## Task 1: Artifact Diagnostics And Promotion Targets

**Files:**
- Create: `nwsl-model/src/backtest/diagnostics.py`
- Create: `nwsl-model/scripts/report_artifact_diagnostics.py`
- Create: `nwsl-model/tests/test_backtest_diagnostics.py`
- Modify: `nwsl-model/src/utils/gating.py`

- [x] **Step 1: Write the failing tests**

```python
# nwsl-model/tests/test_backtest_diagnostics.py
from src.backtest.diagnostics import summarize_gate_blockers


def test_summarize_gate_blockers_reports_target_shortfalls() -> None:
    promotion = {
        "gate_results": {
            "dixon_coles": {
                "gating_status": "research_only",
                "checks": {
                    "beats_best_baseline_log_loss": False,
                    "totals_brier_ok": False,
                },
                "metrics": {
                    "log_loss_1x2": 1.0815,
                    "best_baseline_log_loss": 1.0905,
                    "brier_score_1x2": 0.6549,
                    "best_baseline_brier": 0.6608,
                    "totals_brier_2.5": 0.2505,
                    "expected_total_goals_mae": 1.2634,
                    "best_baseline_total_goals_mae": 1.2612,
                },
            }
        }
    }

    rows = summarize_gate_blockers(promotion, relative_improvement=0.98, totals_brier_gate=0.24)

    assert rows == [
        {
            "model": "dixon_coles",
            "gating_status": "research_only",
            "failed_checks": "beats_best_baseline_log_loss,totals_brier_ok",
            "log_loss_target": 1.06869,
            "log_loss_shortfall": 0.01281,
            "brier_target": 0.647584,
            "brier_shortfall": 0.007316,
            "totals_brier_2_5_target": 0.24,
            "totals_brier_2_5_shortfall": 0.0105,
            "total_goals_mae_target": 1.2612,
            "total_goals_mae_shortfall": 0.0022,
        }
    ]
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_backtest_diagnostics.py -q
```

Expected: FAIL because `src.backtest.diagnostics` does not exist.

- [x] **Step 3: Add the diagnostics implementation**

```python
# nwsl-model/src/backtest/diagnostics.py
from __future__ import annotations

from typing import Any


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 6)


def _shortfall(value: float | None, target: float | None) -> float | None:
    if value is None or target is None:
        return None
    return _round6(max(0.0, float(value) - float(target)))


def summarize_gate_blockers(
    promotion_summary: dict[str, Any],
    *,
    relative_improvement: float,
    totals_brier_gate: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for model_name, result in promotion_summary.get("gate_results", {}).items():
        checks = result.get("checks", {})
        metrics = result.get("metrics", {})
        failed = [name for name, passed in checks.items() if not passed]

        best_log_loss = metrics.get("best_baseline_log_loss")
        best_brier = metrics.get("best_baseline_brier")
        best_total_mae = metrics.get("best_baseline_total_goals_mae")
        log_loss_target = None if best_log_loss is None else float(best_log_loss) * relative_improvement
        brier_target = None if best_brier is None else float(best_brier) * relative_improvement

        rows.append(
            {
                "model": model_name,
                "gating_status": result.get("gating_status", "unknown"),
                "failed_checks": ",".join(failed),
                "log_loss_target": _round6(log_loss_target),
                "log_loss_shortfall": _shortfall(metrics.get("log_loss_1x2"), log_loss_target),
                "brier_target": _round6(brier_target),
                "brier_shortfall": _shortfall(metrics.get("brier_score_1x2"), brier_target),
                "totals_brier_2_5_target": _round6(totals_brier_gate),
                "totals_brier_2_5_shortfall": _shortfall(metrics.get("totals_brier_2.5"), totals_brier_gate),
                "total_goals_mae_target": _round6(best_total_mae),
                "total_goals_mae_shortfall": _shortfall(metrics.get("expected_total_goals_mae"), best_total_mae),
            }
        )
    return rows
```

- [x] **Step 4: Add the CLI report**

```python
# nwsl-model/scripts/report_artifact_diagnostics.py
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backtest.diagnostics import summarize_gate_blockers
from src.utils.gating import PURE_PROJECTION_THRESHOLDS


def main() -> None:
    parser = argparse.ArgumentParser(description="Report promotion blockers for a model artifact")
    parser.add_argument("--artifact-root", default="data/processed/models")
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    version_dir = Path(args.artifact_root) / args.version
    promotion_path = version_dir / "promotion_summary.json"
    promotion = json.loads(promotion_path.read_text(encoding="utf-8"))
    rows = summarize_gate_blockers(
        promotion,
        relative_improvement=PURE_PROJECTION_THRESHOLDS["relative_baseline_improvement"],
        totals_brier_gate=PURE_PROJECTION_THRESHOLDS["totals_brier"],
    )
    frame = pd.DataFrame(rows)
    print(frame.to_string(index=False))
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(args.output, index=False)


if __name__ == "__main__":
    main()
```

- [x] **Step 5: Run tests and produce the current report**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_backtest_diagnostics.py -q
cd nwsl-model
python3 scripts/report_artifact_diagnostics.py --version 20260525T233557Z --output data/processed/models/20260525T233557Z/gate_blockers.csv
```

Expected: test passes; report writes `gate_blockers.csv`.

- [x] **Step 6: Commit**

```bash
git add nwsl-model/src/backtest/diagnostics.py nwsl-model/scripts/report_artifact_diagnostics.py nwsl-model/tests/test_backtest_diagnostics.py nwsl-model/data/processed/models/20260525T233557Z/gate_blockers.csv
git commit -m "feat: add model promotion diagnostics"
```

## Task 2: Odds Snapshot History

**Files:**
- Create: `nwsl-model/src/odds/snapshots.py`
- Create: `nwsl-model/scripts/append_odds_snapshot.py`
- Create: `nwsl-model/tests/test_odds_snapshots.py`
- Modify: `nwsl-model/configs/default.yaml`

- [x] **Step 1: Write the failing snapshot tests**

```python
# nwsl-model/tests/test_odds_snapshots.py
import pandas as pd

from src.odds.snapshots import append_snapshot_rows


def test_append_snapshot_rows_deduplicates_same_capture() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.6,
                "source_type": "current",
            }
        ]
    )
    incoming = existing.copy()

    combined = append_snapshot_rows(existing, incoming)

    assert len(combined) == 1
    assert combined.loc[0, "home_odds"] == 2.0


def test_append_snapshot_rows_keeps_new_price_change() -> None:
    existing = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T23:01:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.0,
                "draw_odds": 3.2,
                "away_odds": 3.6,
                "source_type": "current",
            }
        ]
    )
    incoming = existing.copy()
    incoming.loc[0, "timestamp"] = "2026-05-26T23:01:00+00:00"
    incoming.loc[0, "home_odds"] = 1.95

    combined = append_snapshot_rows(existing, incoming)

    assert len(combined) == 2
    assert combined["timestamp"].tolist() == [
        "2026-05-25T23:01:00+00:00",
        "2026-05-26T23:01:00+00:00",
    ]
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_odds_snapshots.py -q
```

Expected: FAIL because `src.odds.snapshots` does not exist.

- [x] **Step 3: Implement snapshot de-duplication**

```python
# nwsl-model/src/odds/snapshots.py
from __future__ import annotations

from pathlib import Path

import pandas as pd


SNAPSHOT_KEY_COLUMNS = [
    "match_id",
    "timestamp",
    "sportsbook",
    "market_type",
    "line",
    "home_odds",
    "draw_odds",
    "away_odds",
    "over_odds",
    "under_odds",
]


def append_snapshot_rows(existing: pd.DataFrame, incoming: pd.DataFrame) -> pd.DataFrame:
    frames = [frame for frame in [existing, incoming] if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True, sort=False)
    for column in SNAPSHOT_KEY_COLUMNS:
        if column not in combined.columns:
            combined[column] = pd.NA
    combined["match_id"] = combined["match_id"].astype(str)
    combined = combined.drop_duplicates(subset=SNAPSHOT_KEY_COLUMNS, keep="last")
    return combined.sort_values(["timestamp", "match_id", "sportsbook", "market_type"]).reset_index(drop=True)


def append_snapshot_file(snapshot_path: Path, incoming_path: Path) -> pd.DataFrame:
    existing = pd.read_csv(snapshot_path) if snapshot_path.exists() else pd.DataFrame()
    incoming = pd.read_csv(incoming_path)
    combined = append_snapshot_rows(existing, incoming)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(snapshot_path, index=False)
    return combined
```

- [x] **Step 4: Add the append CLI**

```python
# nwsl-model/scripts/append_odds_snapshot.py
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.snapshots import append_snapshot_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Append current odds into the historical snapshot file")
    parser.add_argument("--incoming", default="data/raw/odds.csv")
    parser.add_argument("--snapshot", default="data/raw/odds_snapshots.csv")
    args = parser.parse_args()

    combined = append_snapshot_file(Path(args.snapshot), Path(args.incoming))
    print(f"Wrote {len(combined)} odds snapshot rows to {args.snapshot}")


if __name__ == "__main__":
    main()
```

- [x] **Step 5: Run tests and seed the first snapshot**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_odds_snapshots.py -q
cd nwsl-model
python3 scripts/append_odds_snapshot.py --incoming data/raw/odds.csv --snapshot data/raw/odds_snapshots.csv
```

Expected: tests pass; snapshot file has 8 rows on the first run.

- [x] **Step 6: Commit**

```bash
git add nwsl-model/src/odds/snapshots.py nwsl-model/scripts/append_odds_snapshot.py nwsl-model/tests/test_odds_snapshots.py nwsl-model/data/raw/odds_snapshots.csv nwsl-model/configs/default.yaml
git commit -m "feat: archive current odds snapshots"
```

## Task 3: Closing Odds Materialization

**Files:**
- Create: `nwsl-model/scripts/materialize_closing_odds.py`
- Extend: `nwsl-model/src/odds/snapshots.py`
- Extend: `nwsl-model/tests/test_odds_snapshots.py`

- [x] **Step 1: Add the failing close-odds test**

```python
# Add to nwsl-model/tests/test_odds_snapshots.py
from src.odds.snapshots import materialize_closing_odds


def test_materialize_closing_odds_picks_latest_snapshot_before_match() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "1",
                "match_date": "2026-05-30",
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "match_status": "completed",
            }
        ]
    )
    snapshots = pd.DataFrame(
        [
            {
                "match_id": "1",
                "timestamp": "2026-05-25T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 2.05,
                "draw_odds": 3.25,
                "away_odds": 3.45,
                "source_type": "current",
            },
            {
                "match_id": "1",
                "timestamp": "2026-05-29T20:00:00+00:00",
                "sportsbook": "FootyStats",
                "market_type": "1x2",
                "line": None,
                "home_odds": 1.95,
                "draw_odds": 3.30,
                "away_odds": 3.70,
                "source_type": "current",
            },
        ]
    )

    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=168)

    assert close.to_dict("records")[0]["source_type"] == "close"
    assert close.to_dict("records")[0]["home_odds"] == 1.95
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_odds_snapshots.py::test_materialize_closing_odds_picks_latest_snapshot_before_match -q
```

Expected: FAIL because `materialize_closing_odds` does not exist.

- [x] **Step 3: Implement closing odds materialization**

```python
# Add to nwsl-model/src/odds/snapshots.py
def materialize_closing_odds(
    matches: pd.DataFrame,
    snapshots: pd.DataFrame,
    *,
    max_hours_before_match: int = 168,
) -> pd.DataFrame:
    if matches.empty or snapshots.empty:
        return snapshots.iloc[0:0].copy()

    completed = matches[matches.get("match_status", "completed").astype(str).str.lower() == "completed"].copy()
    completed["match_id"] = completed["match_id"].astype(str)
    completed["match_datetime"] = pd.to_datetime(completed["match_date"], utc=True, errors="coerce")

    rows = []
    snap = snapshots.copy()
    snap["match_id"] = snap["match_id"].astype(str)
    snap["timestamp_dt"] = pd.to_datetime(snap["timestamp"], utc=True, errors="coerce")
    for match in completed.itertuples(index=False):
        candidates = snap[snap["match_id"] == str(match.match_id)].copy()
        candidates = candidates[candidates["timestamp_dt"].notna()]
        candidates = candidates[candidates["timestamp_dt"] <= match.match_datetime]
        candidates = candidates[candidates["timestamp_dt"] >= match.match_datetime - pd.Timedelta(hours=max_hours_before_match)]
        if candidates.empty:
            continue
        latest = candidates.sort_values("timestamp_dt").iloc[-1].copy()
        latest["source_type"] = "close"
        rows.append(latest.drop(labels=["timestamp_dt"]).to_dict())
    return pd.DataFrame(rows)
```

- [x] **Step 4: Add the CLI**

```python
# nwsl-model/scripts/materialize_closing_odds.py
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.odds.snapshots import materialize_closing_odds


def main() -> None:
    parser = argparse.ArgumentParser(description="Build close odds from snapshot history")
    parser.add_argument("--matches", default="data/raw/matches.csv")
    parser.add_argument("--snapshots", default="data/raw/odds_snapshots.csv")
    parser.add_argument("--output", default="data/raw/closing_odds.csv")
    parser.add_argument("--max-hours-before-match", type=int, default=168)
    args = parser.parse_args()

    matches = pd.read_csv(args.matches)
    snapshots = pd.read_csv(args.snapshots)
    close = materialize_closing_odds(matches, snapshots, max_hours_before_match=args.max_hours_before_match)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    close.to_csv(args.output, index=False)
    print(f"Wrote {len(close)} close odds rows to {args.output}")


if __name__ == "__main__":
    main()
```

- [x] **Step 5: Run tests**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_odds_snapshots.py -q
```

Expected: all snapshot tests pass.

- [x] **Step 6: Commit**

```bash
git add nwsl-model/src/odds/snapshots.py nwsl-model/scripts/materialize_closing_odds.py nwsl-model/tests/test_odds_snapshots.py
git commit -m "feat: materialize closing odds from snapshots"
```

## Task 4: Chronological Tuning Harness

**Files:**
- Create: `nwsl-model/src/backtest/tuning.py`
- Create: `nwsl-model/scripts/tune_backtest.py`
- Create: `nwsl-model/tests/test_backtest_tuning.py`

- [x] **Step 1: Write the failing ranking test**

```python
# nwsl-model/tests/test_backtest_tuning.py
import pandas as pd

from src.backtest.tuning import rank_tuning_results


def test_rank_tuning_results_prefers_lower_log_loss_then_lower_brier() -> None:
    results = pd.DataFrame(
        [
            {"candidate": "reg_1000", "log_loss_1x2": 1.09, "brier_score_1x2": 0.66},
            {"candidate": "reg_2000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.655},
            {"candidate": "reg_3000", "log_loss_1x2": 1.08, "brier_score_1x2": 0.650},
        ]
    )

    ranked = rank_tuning_results(results)

    assert ranked["candidate"].tolist() == ["reg_3000", "reg_2000", "reg_1000"]
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_backtest_tuning.py -q
```

Expected: FAIL because `src.backtest.tuning` does not exist.

- [x] **Step 3: Implement ranking and deterministic candidate IDs**

```python
# nwsl-model/src/backtest/tuning.py
from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd


def candidate_id(params: dict[str, Any]) -> str:
    payload = json.dumps(params, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]


def rank_tuning_results(results: pd.DataFrame) -> pd.DataFrame:
    return results.sort_values(
        ["log_loss_1x2", "brier_score_1x2", "expected_total_goals_mae"],
        ascending=[True, True, True],
        na_position="last",
    ).reset_index(drop=True)
```

- [x] **Step 4: Add the CLI wrapper**

Create `nwsl-model/scripts/tune_backtest.py` as a bounded wrapper that:
- Reads `configs/default.yaml`.
- Iterates regularization values `[1000.0, 1500.0, 2000.0, 3000.0, 5000.0]`.
- Writes per-candidate configs under `data/processed/tuning/<run_id>/configs/`.
- Calls `scripts/backtest.py` with `step_size=56`, `max_iter=150`, and each candidate config.
- Writes `data/processed/tuning/<run_id>/summary.csv`.

Use subprocess calls with argument arrays, not shell strings.

- [x] **Step 5: Run focused tests**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_backtest_tuning.py -q
```

Expected: pass.

- [x] **Step 6: Run one bounded tuning smoke**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 scripts/tune_backtest.py --config configs/default.yaml --max-candidates 2 --step-size 56 --max-iter 150
```

Expected: writes a tuning summary with two completed candidates.

- [x] **Step 7: Commit**

```bash
git add nwsl-model/src/backtest/tuning.py nwsl-model/scripts/tune_backtest.py nwsl-model/tests/test_backtest_tuning.py nwsl-model/data/processed/tuning
git commit -m "feat: add chronological tuning harness"
```

## Task 5: Score-Matrix Calibration Candidate

**Files:**
- Create: `nwsl-model/src/models/score_matrix_calibration.py`
- Create: `nwsl-model/tests/test_score_matrix_calibration.py`
- Modify: `nwsl-model/src/backtest/runner.py`
- Modify: `nwsl-model/scripts/evaluate.py`

- [x] **Step 1: Write the failing normalization test**

```python
# nwsl-model/tests/test_score_matrix_calibration.py
import numpy as np

from src.models.score_matrix_calibration import calibrate_score_matrix


def test_calibrate_score_matrix_preserves_normalized_distribution() -> None:
    matrix = np.ones((3, 3), dtype=float) / 9.0

    calibrated = calibrate_score_matrix(matrix, total_intensity_scale=1.10, draw_inflation=1.05)

    assert calibrated.shape == (3, 3)
    assert abs(float(calibrated.sum()) - 1.0) < 1e-12
    assert (calibrated >= 0).all()
    assert calibrated[1, 1] > matrix[1, 1]
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_score_matrix_calibration.py -q
```

Expected: FAIL because `src.models.score_matrix_calibration` does not exist.

- [x] **Step 3: Implement the calibration primitive**

```python
# nwsl-model/src/models/score_matrix_calibration.py
from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def calibrate_score_matrix(
    matrix: NDArray[np.float64],
    *,
    total_intensity_scale: float = 1.0,
    draw_inflation: float = 1.0,
) -> NDArray[np.float64]:
    calibrated = np.asarray(matrix, dtype=float).copy()
    n_home, n_away = calibrated.shape
    for home in range(n_home):
        for away in range(n_away):
            total = home + away
            if total_intensity_scale != 1.0:
                calibrated[home, away] *= total_intensity_scale ** total
            if home == away:
                calibrated[home, away] *= draw_inflation
    total_mass = float(calibrated.sum())
    if total_mass <= 0.0:
        raise ValueError("Score matrix has no positive probability mass after calibration.")
    return calibrated / total_mass
```

- [x] **Step 4: Add fit-time search**

Extend `score_matrix_calibration.py` with a grid search over:
- `total_intensity_scale`: `[0.90, 0.95, 1.00, 1.05, 1.10]`
- `draw_inflation`: `[0.90, 1.00, 1.10, 1.20]`

The objective is fold-level multiclass log loss plus `0.25 * over_2_5_brier`. Reject any setting that worsens log loss versus uncalibrated output.

- [x] **Step 5: Wire into evaluation as an artifact only**

In `nwsl-model/scripts/evaluate.py`, write calibrated parameters to `calibration_artifacts.json` under each model. Do not apply them to live predictions unless the model still passes promotion gates after the calibrated backtest.

- [x] **Step 6: Run tests and a focused evaluation**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_score_matrix_calibration.py -q
cd nwsl-model
python3 scripts/evaluate.py --artifact-root data/processed/models --version 20260525T233557Z
```

Expected: tests pass; evaluation writes calibration artifacts without promoting a model.

- [x] **Step 7: Commit**

```bash
git add nwsl-model/src/models/score_matrix_calibration.py nwsl-model/tests/test_score_matrix_calibration.py nwsl-model/src/backtest/runner.py nwsl-model/scripts/evaluate.py
git commit -m "feat: add score matrix calibration candidate"
```

## Task 6: Regularized Elo Baseline Candidate

**Files:**
- Create: `nwsl-model/src/models/elo_baseline.py`
- Create: `nwsl-model/tests/test_elo_baseline.py`
- Modify: `nwsl-model/src/backtest/runner.py`
- Modify: `nwsl-model/configs/default.yaml`

- [x] **Step 1: Write the failing Elo tests**

```python
# nwsl-model/tests/test_elo_baseline.py
import pandas as pd

from src.models.elo_baseline import RegularizedEloBaseline


def test_regularized_elo_baseline_updates_home_and_away_ratings() -> None:
    model = RegularizedEloBaseline(k_factor=20.0, home_advantage_elo=45.0, draw_weight=0.5)
    matches = pd.DataFrame(
        [
            {
                "home_team": "Orlando Pride",
                "away_team": "Bay FC",
                "home_goals_90": 2,
                "away_goals_90": 0,
            }
        ]
    )

    model.fit(matches)

    assert model.ratings["Orlando Pride"] > 1500.0
    assert model.ratings["Bay FC"] < 1500.0


def test_regularized_elo_baseline_predicts_valid_1x2_probs() -> None:
    model = RegularizedEloBaseline()

    probs = model.predict_1x2("Orlando Pride", "Bay FC")

    assert abs(sum(probs) - 1.0) < 1e-12
    assert all(0.0 < value < 1.0 for value in probs)
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_elo_baseline.py -q
```

Expected: FAIL because `src.models.elo_baseline` does not exist.

- [x] **Step 3: Implement the candidate**

Implement `RegularizedEloBaseline` with:
- Starting rating `1500.0`
- Home advantage `45.0` Elo points
- Draw probability anchored to current league draw rate with shrinkage toward `0.27`
- Home/away non-draw probabilities from Elo logistic win expectation
- A `predict_score_matrix()` adapter that returns a low-information Poisson matrix matching 1X2 probabilities as closely as existing utilities allow.

- [x] **Step 4: Register in backtest only**

Modify `nwsl-model/src/backtest/runner.py` so `regularized_elo_baseline` is available in `backtest.benchmarks`.

- [x] **Step 5: Add disabled default config**

Add to `nwsl-model/configs/default.yaml`:

```yaml
elo_baseline:
  k_factor: 20.0
  home_advantage_elo: 45.0
  draw_prior: 0.27
  draw_prior_weight: 50.0
```

Do not add it to the default benchmark list until its focused tests and one bounded backtest are clean.

- [x] **Step 6: Run tests**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_elo_baseline.py nwsl-model/tests/test_backtest_config.py -q
```

Expected: all selected tests pass.

- [x] **Step 7: Commit**

```bash
git add nwsl-model/src/models/elo_baseline.py nwsl-model/tests/test_elo_baseline.py nwsl-model/src/backtest/runner.py nwsl-model/configs/default.yaml
git commit -m "feat: add regularized elo baseline candidate"
```

## Task 7: Near-Term Betting Slate Export

**Files:**
- Create: `nwsl-model/scripts/generate_betting_slate.py`
- Create: `nwsl-model/tests/test_betting_slate.py`
- Modify: `nwsl-model/src/betting/recommendations.py` only if the test exposes missing reasons.

- [x] **Step 1: Write the failing slate filter test**

```python
# nwsl-model/tests/test_betting_slate.py
import pandas as pd

from scripts.generate_betting_slate import filter_near_term_slate


def test_filter_near_term_slate_limits_to_window_and_current_odds() -> None:
    predictions = pd.DataFrame(
        [
            {"match_id": "1", "match_date": "2026-05-29", "has_market_odds": True},
            {"match_id": "2", "match_date": "2026-06-20", "has_market_odds": True},
            {"match_id": "3", "match_date": "2026-05-30", "has_market_odds": False},
        ]
    )

    slate = filter_near_term_slate(predictions, as_of="2026-05-26", days=14)

    assert slate["match_id"].tolist() == ["1"]
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_betting_slate.py -q
```

Expected: FAIL because `scripts.generate_betting_slate` does not exist.

- [x] **Step 3: Implement the slate filter and CLI**

Create `nwsl-model/scripts/generate_betting_slate.py` with:
- `filter_near_term_slate(predictions, as_of, days)`
- Required fields: `match_id`, `match_date`, `home_team`, `away_team`, `gating_status`, `has_market_odds`, `accepted_bet`, `bet_reason`
- CLI defaults:
  - `--predictions data/processed/predictions.csv`
  - `--days 14`
  - `--output data/processed/betting_slate.csv`
  - `--json-output data/processed/web/betting_slate.json`
- If `gating_status != passed`, every row must have `accepted_bet=false` and reason `model_gating_not_passed`.
- If odds are absent for a match, reason must be `missing_market_price`.

- [x] **Step 4: Run tests and generate slate**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
python3 -m pytest nwsl-model/tests/test_betting_slate.py nwsl-model/tests/test_recommendations.py -q
cd nwsl-model
python3 scripts/generate_betting_slate.py --predictions data/processed/predictions.csv --days 14
```

Expected: tests pass; current slate contains only near-term rows and zero accepted bets unless a promoted model exists.

- [x] **Step 5: Commit**

```bash
git add nwsl-model/scripts/generate_betting_slate.py nwsl-model/tests/test_betting_slate.py nwsl-model/data/processed/betting_slate.csv nwsl-model/data/processed/web/betting_slate.json
git commit -m "feat: add near-term betting slate export"
```

## Task 8: Full Validation Run And Promotion Decision

**Files:**
- Generated: `nwsl-model/data/processed/models/<new_version>/`
- Generated: `nwsl-model/data/processed/predictions.csv`
- Generated: `nwsl-model/data/processed/web/predictions.json`
- Generated: `nwsl-model/data/processed/betting_slate.csv`

- [x] **Step 1: Train a fresh artifact**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 scripts/train.py --config configs/default.yaml
```

Expected: new timestamped model directory under `data/processed/models/`.

- [x] **Step 2: Run the full chronological backtest**

Run:

```bash
python3 scripts/backtest.py --config configs/default.yaml --artifact-root data/processed/models --version <new_version>
```

Expected: `backtest_summary.json` exists in the new artifact directory and includes all configured candidates.

- [x] **Step 3: Evaluate and promote only if gates pass**

Run:

```bash
python3 scripts/evaluate.py --artifact-root data/processed/models --version <new_version>
python3 scripts/promote.py --artifact-root data/processed/models --version <new_version>
python3 scripts/report_artifact_diagnostics.py --version <new_version> --output data/processed/models/<new_version>/gate_blockers.csv
```

Expected:
- If no model passes gates, `champions.json` remains without a promoted score alias.
- If a model passes gates, `champions.json` points only to that passing model.

- [x] **Step 4: Regenerate predictions and slate**

Run:

```bash
python3 scripts/predict.py --config configs/default.yaml --matches data/raw/upcoming.csv --model champion_pure --model-dir data/processed/models --output data/processed/predictions.csv
python3 scripts/export_web.py --config configs/default.yaml --model-dir data/processed --output-dir data/processed/web
python3 scripts/generate_betting_slate.py --predictions data/processed/predictions.csv --days 14
```

Expected:
- 155 upcoming match predictions.
- Near-term betting slate generated.
- Accepted bets remain zero unless the resolved model has `gating_status=passed` and current odds produce a qualified edge.

- [x] **Step 5: Run full verification**

Run:

```bash
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main/nwsl-model
python3 -m pytest -q
cd /Users/zsoskin/Downloads/nwsl-fantasy-platform-main
pnpm test
git diff --check
```

Expected:
- Python tests pass.
- Vitest suite passes.
- No whitespace errors.

- [x] **Step 6: Commit**

```bash
git add nwsl-model docs/superpowers/plans/2026-05-26-nwsl-model-improvement.md
git commit -m "feat: improve nwsl model validation pipeline"
```

## Acceptance Criteria

- Current odds snapshots are append-only and repeatable.
- Closing odds can be materialized from snapshots once matches complete.
- Every promotion failure includes explicit target shortfall values.
- The tuning harness produces chronological, auditable summaries without future leakage.
- Any score-matrix calibration is evaluated chronologically and cannot silently promote a weaker model.
- A new baseline/candidate is allowed to become the production fallback only if it wins on fresh chronological evidence.
- The 7-to-14-day betting slate never emits accepted bets for `research_only` models.
- Full verification passes with `python3 -m pytest -q`, `pnpm test`, and `git diff --check`.

## Recommended Execution Order

1. Task 1, because diagnostics make every later result easier to judge.
2. Task 2 and Task 3, because odds history is the biggest betting-readiness gap.
3. Task 4, because tuning should be auditable before more candidates are added.
4. Task 5 and Task 6, because they are model-quality experiments with bounded blast radius.
5. Task 7, because user-facing betting output should be separate from full-season projections.
6. Task 8, because promotion should happen only after the full chain is verified.

## Self-Review

- Spec coverage: The plan covers the known blockers: model promotion shortfall, odds capture, close odds, calibration, candidate baselines, near-term betting slate, and full verification.
- Placeholder scan: The plan avoids open-ended placeholder work. Where implementation requires integration with existing runner internals, the expected behavior and commands are concrete.
- Type consistency: Function names used by tests match the implementation names in the same task.
- Scope check: This is one model-quality improvement program, but it is split into independent tasks that can each be tested and committed separately.
