#!/usr/bin/env bash
# Recurring CLV capture: run the lightweight source poller, then accumulate the
# official availability report.
#
# DraftKings via Apify and FOX Sports are authoritative current sources.
# API-Football is captured in a separate shadow history. The poller removes
# stale rows before capturing the active snapshot.
#
# Install via launchd/cron to run a few times a day. See README note at bottom.

set -u

MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MODEL_ROOT" || exit 1

LOG_DIR="$MODEL_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/capture_clv_$(date -u +%Y%m%dT%H%M%SZ).log"

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

run_step "odds_poll" bash scripts/poll_current_odds.sh

# Accumulate the weekly official availability report (injury/suspension/intl
# duty) into its dated snapshot store so historical availability builds up.
run_step "availability" "$PY" scripts/fetch_nwsl_availability.py

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
