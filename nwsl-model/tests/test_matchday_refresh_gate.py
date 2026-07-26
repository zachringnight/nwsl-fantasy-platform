from __future__ import annotations

import os
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "run_matchday_refresh_if_scheduled.sh"


def run_gate(tmp_path: Path, target_date: str) -> subprocess.CompletedProcess[str]:
    upcoming = tmp_path / "upcoming.csv"
    upcoming.write_text(
        "match_id,match_date,home_team,away_team\n"
        "m1,2026-07-26,Angel City FC,Bay FC\n",
        encoding="utf-8",
    )
    env = {
        **os.environ,
        "NWSL_UPCOMING_PATH": str(upcoming),
        "NWSL_MATCHDAY_DATE": target_date,
        "NWSL_MATCHDAY_DRY_RUN": "1",
    }
    return subprocess.run(
        ["bash", str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_matchday_gate_runs_when_fixture_is_scheduled(tmp_path: Path) -> None:
    result = run_gate(tmp_path, "2026-07-26")

    assert result.returncode == 0
    assert "match scheduled" in result.stdout
    assert "dry run only" in result.stdout


def test_matchday_gate_skips_without_fixture(tmp_path: Path) -> None:
    result = run_gate(tmp_path, "2026-07-27")

    assert result.returncode == 0
    assert "no match scheduled" in result.stdout


def test_matchday_gate_fails_closed_without_match_date_column(
    tmp_path: Path,
) -> None:
    upcoming = tmp_path / "upcoming.csv"
    upcoming.write_text(
        "match_id,home_team,away_team\nm1,Angel City FC,Bay FC\n",
        encoding="utf-8",
    )
    env = {
        **os.environ,
        "NWSL_UPCOMING_PATH": str(upcoming),
        "NWSL_MATCHDAY_DATE": "2026-07-26",
        "NWSL_MATCHDAY_DRY_RUN": "1",
    }
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 1
    assert "failed closed" in result.stdout
