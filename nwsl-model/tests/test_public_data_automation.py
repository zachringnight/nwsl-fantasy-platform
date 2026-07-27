from __future__ import annotations

import subprocess
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parent.parent
    / "scripts"
    / "track_matchday_cron.sh"
)


def test_tracker_shell_is_valid() -> None:
    result = subprocess.run(
        ["bash", "-n", str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_public_data_publish_runs_independently_of_model_success() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    public_step = source.index(
        'run_public_data_step "publish_public_data_supabase"'
    )
    model_publish_gate = source.index(
        'if [ "$status" -eq 0 ] && [ "$REQUIRED_FAILURE" -eq 0 ]; then'
    )

    assert public_step < model_publish_gate
    assert '"$PY" scripts/refresh_public_data.py' in source
    assert "PUBLIC_DATA_FAILURE=1" in source
    assert (
        'if [ "$REQUIRED_FAILURE" -ne 0 ] || '
        '[ "$PUBLIC_DATA_FAILURE" -ne 0 ] || '
        '[ "$GENERAL_PROJECTION_FAILURE" -ne 0 ]; then'
    ) in source
    assert "PUBLIC_DATA_FAILURE" not in source[
        model_publish_gate:source.index(
            'run_required_step "publish_supabase"',
            model_publish_gate,
        )
    ]


def test_general_projection_pipeline_has_an_independent_failure_state() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "GENERAL_PROJECTION_FAILURE=0" in source
    assert "run_general_projection_step" in source
    assert '"official_player_appearances"' in source
    assert '"operational_features"' in source
    assert '"general_train"' in source
    assert '"general_predict"' in source
    assert '"publish_general_predictions_supabase"' in source
    lineage_step = source.index(
        'run_required_step "daily_lineage"'
    )
    source_failure_gate = source.index(
        'if [ "$REQUIRED_FAILURE" -ne 0 ]; then\n'
        '    GENERAL_PROJECTION_FAILURE=1',
        lineage_step,
    )
    official_step = source.index('"official_player_appearances"')
    assert lineage_step < source_failure_gate < official_step
    assert (
        'if [ "$REQUIRED_FAILURE" -ne 0 ] || '
        '[ "$PUBLIC_DATA_FAILURE" -ne 0 ] || '
        '[ "$GENERAL_PROJECTION_FAILURE" -ne 0 ]; then'
    ) in source
