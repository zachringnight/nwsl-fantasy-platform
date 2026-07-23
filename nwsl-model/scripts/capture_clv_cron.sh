#!/usr/bin/env bash
# Recurring CLV capture: refresh current odds from each book, then append the
# live line into the snapshot store so open->close movement accumulates.
#
# Each fetch reads its Apify token from the gitignored .env.local itself, so the
# token is never placed in the shell environment or logged here. A single book
# failing (proxy hiccup, no upcoming slate) must not block the others or the
# snapshot append, so fetches are run best-effort.
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

# Best-effort refresh of each book's current line into data/raw/odds.csv.
run_step "draftkings" "$PY" scripts/fetch_apify_draftkings_odds.py
run_step "footystats" "$PY" scripts/fetch_apify_footystats_odds.py
run_step "foxsports"  "$PY" scripts/fetch_foxsports_odds.py

# Append whatever live rows now sit in odds.csv into the snapshot history.
run_step "snapshot" "$PY" scripts/capture_clv_snapshot.py

# Accumulate the weekly official availability report (injury/suspension/intl
# duty) into its dated snapshot store so historical availability builds up.
run_step "availability" "$PY" scripts/fetch_nwsl_availability.py

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
