#!/usr/bin/env bash
# Run the full tracker only when the local fixture contract contains a match
# today. This is used for the two extra matchday-only Codex refreshes.

set -u

MODEL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPCOMING_PATH="${NWSL_UPCOMING_PATH:-$MODEL_ROOT/data/raw/upcoming.csv}"
TODAY_LOCAL="${NWSL_MATCHDAY_DATE:-$(TZ=America/Los_Angeles date +%F)}"

if [ ! -f "$UPCOMING_PATH" ]; then
    echo "Matchday gate failed closed: fixture file missing at $UPCOMING_PATH"
    exit 1
fi

awk -F',' -v target="$TODAY_LOCAL" '
    NR == 1 {
        for (i = 1; i <= NF; i += 1) {
            header = $i
            gsub(/^"|"$/, "", header)
            if (header == "match_date") date_col = i
        }
        next
    }
    date_col > 0 {
        value = $date_col
        gsub(/^"|"$/, "", value)
        if (value == target) found = 1
    }
    END {
        if (date_col == 0) exit 2
        exit(found ? 0 : 1)
    }
' "$UPCOMING_PATH"
GATE_STATUS=$?

if [ "$GATE_STATUS" -eq 0 ]; then
    if [ "${NWSL_MATCHDAY_DRY_RUN:-0}" = "1" ]; then
        echo "Matchday gate: match scheduled on $TODAY_LOCAL; dry run only."
        exit 0
    fi
    echo "Matchday gate: match scheduled on $TODAY_LOCAL; running full tracker."
    exec bash "$MODEL_ROOT/scripts/track_matchday_cron.sh"
fi

if [ "$GATE_STATUS" -ne 1 ]; then
    echo "Matchday gate failed closed: match_date column missing or fixture file invalid."
    exit 1
fi

echo "Matchday gate: no match scheduled on $TODAY_LOCAL; no refresh needed."
exit 0
