from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd

RANK_SORT_COLUMNS = ("log_loss_1x2", "brier_score_1x2", "expected_total_goals_mae")


def candidate_id(params: dict[str, Any]) -> str:
    payload = json.dumps(params, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]


def rank_tuning_results(results: pd.DataFrame) -> pd.DataFrame:
    sort_columns = [column for column in RANK_SORT_COLUMNS if column in results.columns]
    if not sort_columns:
        return results.reset_index(drop=True)

    return results.sort_values(
        sort_columns,
        ascending=[True] * len(sort_columns),
        na_position="last",
        kind="mergesort",
    ).reset_index(drop=True)
