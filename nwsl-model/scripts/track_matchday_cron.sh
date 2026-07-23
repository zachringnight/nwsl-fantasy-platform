#!/usr/bin/env bash
# Daily matchday tracker: refresh odds, regenerate picks, settle past picks.
#
# This is the deterministic data pipeline behind the forward pick-log. It does
# NOT send Slack itself (no webhook in this repo) -- a scheduled Claude job runs
# this, reads data/processed/pick_record_report.md, and DMs the report to Zach.
#
# Each odds fetch reads its Apify token from the gitignored .env.local itself,
# so no secret is placed in the shell environment or logged here. A single book
# failing must not block the rest, so fetches are best-effort.

set -u

MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MODEL_ROOT" || exit 1

LOG_DIR="$MODEL_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/track_matchday_$(date -u +%Y%m%dT%H%M%SZ).log"

PY="${PYTHON:-python3}"

run_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED (continuing) ---" >>"$LOG_FILE"
    fi
}

# 1. Best-effort refresh of each book's current line into data/raw/odds.csv.
run_step "draftkings" "$PY" scripts/fetch_apify_draftkings_odds.py
run_step "footystats" "$PY" scripts/fetch_apify_footystats_odds.py
run_step "foxsports"  "$PY" scripts/fetch_foxsports_odds.py

# 2. Regenerate projections for upcoming fixtures and build the actionable slate.
run_step "predict" "$PY" scripts/predict.py \
    --matches data/raw/upcoming.csv \
    --output data/processed/predictions.csv
run_step "slate" "$PY" scripts/generate_betting_slate.py

# 3. Lock today's picks into the forward ledger and settle anything now played.
#    track_matchday must succeed -- it is the point of the job -- so its exit
#    status is the script's exit status.
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) track_matchday ===" >>"$LOG_FILE"
"$PY" scripts/track_matchday.py >>"$LOG_FILE" 2>&1
status=$?
echo "--- track_matchday exit $status ---" >>"$LOG_FILE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
exit "$status"
