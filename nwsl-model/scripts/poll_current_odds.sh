#!/usr/bin/env bash
# Lightweight current-odds poller. API-Football is shadow-only; FOX Sports
# remains the authoritative live total source for the frozen policy.

set -u

MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MODEL_ROOT" || exit 1

LOG_DIR="$MODEL_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/poll_current_odds_$(date -u +%Y%m%dT%H%M%SZ).log"
PY="${PYTHON:-python3}"
REQUIRED_FAILURE=0

run_step() {
    local label="$1"; shift
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $label ===" >>"$LOG_FILE"
    if "$@" >>"$LOG_FILE" 2>&1; then
        echo "--- $label ok ---" >>"$LOG_FILE"
    else
        echo "--- $label FAILED (continuing) ---" >>"$LOG_FILE"
    fi
}

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

run_step "api_football_shadow" "$PY" scripts/fetch_api_football_shadow.py
run_step "foxsports" "$PY" scripts/fetch_foxsports_odds.py

# The legacy Apify feeds require a residential proxy that is not currently
# available on this account. Keep an explicit opt-in for future diagnostics,
# but do not burn predictable failing requests on every poll.
if [ "${ENABLE_LEGACY_APIFY_ODDS:-0}" = "1" ]; then
    run_step "draftkings_legacy" "$PY" scripts/fetch_apify_draftkings_odds.py
    run_step "footystats_legacy" "$PY" scripts/fetch_apify_footystats_odds.py
fi

run_required_step "freshness" "$PY" scripts/enforce_current_odds_freshness.py
run_required_step "snapshot" "$PY" scripts/capture_clv_snapshot.py
run_required_step "source_health" "$PY" scripts/build_odds_source_health.py

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ===" >>"$LOG_FILE"
echo "Odds polling complete. Log: $LOG_FILE"
exit "$REQUIRED_FAILURE"
