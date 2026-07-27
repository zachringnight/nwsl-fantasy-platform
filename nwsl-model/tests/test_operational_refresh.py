from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.data.operational_refresh import (
    OperationalFeatureOutputs,
    write_operational_features,
)


def test_write_operational_features_fails_closed_when_report_blocked(
    tmp_path: Path,
) -> None:
    outputs = OperationalFeatureOutputs(
        appearances=pd.DataFrame(),
        projected_lineups=pd.DataFrame(),
        team_season_priors=pd.DataFrame(),
        player_season_priors=pd.DataFrame(),
        report={"status": "blocked", "blockers": ["appearances_empty"]},
    )

    with pytest.raises(ValueError, match="appearances_empty"):
        write_operational_features(outputs, raw_dir=tmp_path)

    assert [path.name for path in tmp_path.iterdir()] == [
        "operational_feature_refresh.json"
    ]
