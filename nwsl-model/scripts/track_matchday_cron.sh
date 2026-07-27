#!/usr/bin/env bash
# Daily matchday tracker: refresh odds, regenerate picks, settle past picks.
#
# This is the deterministic data pipeline behind the forward pick-log. It does
# NOT send messages itself. A scheduled Codex task runs this and summarizes the
# resulting pick record and source-health artifacts for Zach.
#
# Odds polling uses the fixed API-Football shadow feed plus the public FOX
# fallback. Provider failures remain best-effort; freshness, snapshot, and
# source-health checks are required and fail closed.

set -u

MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MODEL_ROOT/.." && pwd)"
cd "$MODEL_ROOT" || exit 1

LOG_DIR="$MODEL_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/track_matchday_$(date -u +%Y%m%dT%H%M%SZ).log"

PY="${PYTHON:-python3}"
REQUIRED_FAILURE=0
PUBLIC_DATA_FAILURE=0

run_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED (continuing) ---" >>"$LOG_FILE"
    fi
}

# Required policy steps fail the overall job but still let settlement/reporting
# run so an operator gets the most complete diagnostic possible.
run_required_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED ---" >>"$LOG_FILE"
        REQUIRED_FAILURE=1
    fi
}

run_required_repo_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if (cd "$REPO_ROOT" && "$@") >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED ---" >>"$LOG_FILE"
        REQUIRED_FAILURE=1
    fi
}

# Public website data is required for the overall run, but it has a separate
# failure state so a transient official-data outage cannot suppress an
# otherwise valid model-picks publication (and vice versa).
run_public_data_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED ---" >>"$LOG_FILE"
        PUBLIC_DATA_FAILURE=1
    fi
}

# 1. Refresh completed results/upcoming fixtures and xG before fitting ratings.
run_required_repo_step "espn_schedule" npx tsx scripts/fetch-espn-nwsl.ts
run_required_repo_step "model_input" npx tsx scripts/generate-model-input.ts
run_required_step "asa_xg" "$PY" scripts/fetch_asa_data.py --seasons 2025 2026

# 2. Refresh the website's official 2026 teams, players, schedule, season
#    totals, and exact player-match stats. This publication is intentionally
#    independent of odds/model success, so valid public data still advances
#    when a price source fails closed.
run_public_data_step "publish_public_data_supabase" \
    "$PY" scripts/refresh_public_data.py

# 3. Capture current prices, remove stale "current" rows, append snapshots, and
#    write the provider-health/manual-review gate. API-Football never enters the
#    frozen policy's eligible odds file in this shadow phase.
run_required_step "odds_poll" bash scripts/poll_current_odds.sh

# 4. Fit and serve the isolated, frozen totals-over policy.
run_required_step "policy_train" "$PY" scripts/train.py \
    --model team_ratings_only \
    --output-dir data/processed/policy/nwsl-totals-open-over-v1/models
run_required_step "policy_slate" "$PY" scripts/generate_frozen_policy_slate.py
run_required_step "policy_settle" "$PY" scripts/settle_frozen_policy.py

# 5. Regenerate the legacy/general projections and actionable slate.
run_step "predict" "$PY" scripts/predict.py \
    --matches data/raw/upcoming.csv \
    --output data/processed/predictions.csv
run_step "slate" "$PY" scripts/generate_betting_slate.py

# 6. Lock today's general picks into the forward ledger and settle anything now played.
#    track_matchday must succeed -- it is the point of the job -- so its exit
#    status is the script's exit status.
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) track_matchday ===" >>"$LOG_FILE"
"$PY" scripts/track_matchday.py >>"$LOG_FILE" 2>&1
status=$?
echo "--- track_matchday exit $status ---" >>"$LOG_FILE"

# 7. Publish only a fully successful model snapshot. The authenticated endpoint
#    writes the run, complete slate, immutable picks, and settlements to
#    Supabase atomically; a failed pipeline never replaces the latest good run.
if [ "$status" -eq 0 ] && [ "$REQUIRED_FAILURE" -eq 0 ]; then
    run_required_step "publish_supabase" "$PY" scripts/publish_frozen_policy.py
fi

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
if [ "$REQUIRED_FAILURE" -ne 0 ] || [ "$PUBLIC_DATA_FAILURE" -ne 0 ]; then
    exit 1
fi
exit "$status"
