#!/usr/bin/env bash
# Daily matchday tracker: refresh odds, regenerate all positive model edges,
# and settle the tiered forward recommendation log.
#
# This is the deterministic data pipeline behind the forward pick-log. It does
# NOT send messages itself. A scheduled Codex task runs this and summarizes the
# resulting pick record and source-health artifacts for Zach.
#
# Odds polling uses DraftKings through Apify plus public FOX market context.
# The active research feed evaluates every configured fresh 1X2 and totals
# quote. API-Football remains shadow-only.
# Provider failures remain best-effort;
# freshness, snapshot, and source-health checks are required and fail closed.

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
GENERAL_PROJECTION_FAILURE=0

run_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED (continuing) ---" >>"$LOG_FILE"
    fi
}

# Required acquisition steps fail the overall job while allowing independent
# public/general publication lanes to produce explicit diagnostics.
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

# General match probabilities publish independently from public website data.
# A partial context refresh may be
# published only when its machine-readable artifact explicitly says partial;
# a blocked refresh never advances the latest prediction snapshot.
run_general_projection_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED ---" >>"$LOG_FILE"
        GENERAL_PROJECTION_FAILURE=1
    fi
}

# 1. Refresh completed results/upcoming fixtures and xG before fitting ratings.
run_required_repo_step "espn_schedule" npx tsx scripts/fetch-espn-nwsl.ts
run_required_repo_step "model_input" npx tsx scripts/generate-model-input.ts
run_required_step "asa_xg" "$PY" scripts/fetch_asa_data.py --seasons 2025 2026
run_required_step "daily_lineage" "$PY" scripts/validate_daily_lineage.py
if [ "$REQUIRED_FAILURE" -ne 0 ]; then
    GENERAL_PROJECTION_FAILURE=1
fi

# 2. Refresh the website's official 2026 teams, players, schedule, season
#    totals, and exact player-match stats. This publication is intentionally
#    independent of odds/model success, so valid public data still advances
#    when a price source fails closed.
run_public_data_step "publish_public_data_supabase" \
    "$PY" scripts/refresh_public_data.py

# 3. Refresh the official historical appearance rows and rebuild historical
#    context separately from projected-lineup coverage. The quality report
#    records every missing completed/upcoming match ID.
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "official_player_appearances" \
        "$PY" scripts/fetch_official_player_appearances.py --seasons 2025 2026
fi
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "operational_features" \
        "$PY" scripts/rebuild_operational_features.py --season 2026
fi

# 4. Capture configured current DraftKings and FOX prices, remove stale
#    "current" rows, append snapshots, and write source health. API-Football
#    stays shadow-only.
run_required_step "odds_poll" bash scripts/poll_current_odds.sh

# 5. Rebuild and publish the active general model. Prediction generation also
#    writes the structured positive-edge feed at data/processed/model_edges.csv
#    and data/processed/web/model_edges.json.
GENERAL_VERSION="$(date -u +%Y%m%dT%H%M%SZ)"
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "general_train" "$PY" scripts/train.py \
        --model team_ratings_only \
        --output-dir data/processed/general/models \
        --version "$GENERAL_VERSION" \
        --serving-model-family spi_lite_baseline \
        --require-operational-quality
fi
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "general_predict" "$PY" scripts/predict.py \
        --matches data/raw/upcoming.csv \
        --model spi_lite_baseline \
        --model-dir data/processed/general/models \
        --output data/processed/predictions.csv
fi
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "publish_general_predictions_supabase" \
        "$PY" scripts/publish_general_predictions.py
fi

# Build the match-level edge summary from the same general-model invocation.
if [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    run_general_projection_step "model_edge_slate" \
        "$PY" scripts/generate_betting_slate.py
fi

# 6. Lock threshold-tiered edges into the forward ledger and settle anything
#    now played. The complete positive-edge artifact remains research-only.
#    track_matchday must succeed -- it is the point of the job -- so its exit
#    status is the script's exit status.
status=1
if [ "$REQUIRED_FAILURE" -eq 0 ] && [ "$GENERAL_PROJECTION_FAILURE" -eq 0 ]; then
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) track_matchday ===" >>"$LOG_FILE"
    "$PY" scripts/track_matchday.py >>"$LOG_FILE" 2>&1
    status=$?
    echo "--- track_matchday exit $status ---" >>"$LOG_FILE"
else
    echo "--- track_matchday SKIPPED (required edge-slate inputs incomplete) ---" >>"$LOG_FILE"
fi

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
if [ "$REQUIRED_FAILURE" -ne 0 ] || [ "$PUBLIC_DATA_FAILURE" -ne 0 ] || [ "$GENERAL_PROJECTION_FAILURE" -ne 0 ]; then
    exit 1
fi
exit "$status"
