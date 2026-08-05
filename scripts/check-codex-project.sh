#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
EXPECTED_ROOT="/Users/zsoskin/NWSL/nwsl-fantasy-platform-main"
EXPECTED_REMOTE="https://github.com/zachringnight/nwsl-fantasy-platform.git"
NODE24_DIR="/opt/homebrew/opt/node@24/bin"
CHECK_REMOTE=0

if [[ "${1:-}" == "--remote" ]]; then
  CHECK_REMOTE=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: bash scripts/check-codex-project.sh [--remote]" >&2
  exit 2
fi

failures=0

check_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "ok: $label"
  else
    echo "FAILED: $label (expected $expected, found $actual)" >&2
    failures=$((failures + 1))
  fi
}

check_equal "canonical checkout" "$REPO_ROOT" "$EXPECTED_ROOT"

actual_remote="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
check_equal "GitHub origin" "$actual_remote" "$EXPECTED_REMOTE"

if [[ -x "$NODE24_DIR/node" ]]; then
  node_bin="$NODE24_DIR/node"
else
  node_bin="$(command -v node || true)"
fi

if [[ -z "$node_bin" ]]; then
  echo "FAILED: Node.js is unavailable" >&2
  failures=$((failures + 1))
else
  node_version="$("$node_bin" --version)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  check_equal "Node major" "$node_major" "24"
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm_version="$(PATH="$NODE24_DIR:$PATH" pnpm --version)"
  pnpm_major="${pnpm_version%%.*}"
  check_equal "pnpm major" "$pnpm_major" "11"
else
  echo "FAILED: pnpm is unavailable" >&2
  failures=$((failures + 1))
fi

if command -v uv >/dev/null 2>&1; then
  echo "ok: $(uv --version)"
else
  echo "FAILED: uv is unavailable" >&2
  failures=$((failures + 1))
fi

for required_path in \
  "$REPO_ROOT/AGENTS.md" \
  "$REPO_ROOT/CLAUDE.md" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/nwsl-model/pyproject.toml"; do
  if [[ -f "$required_path" ]]; then
    echo "ok: ${required_path#"$REPO_ROOT/"}"
  else
    echo "FAILED: missing ${required_path#"$REPO_ROOT/"}" >&2
    failures=$((failures + 1))
  fi
done

branch="$(git -C "$REPO_ROOT" branch --show-current)"
dirty_count="$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ')"
echo "info: branch ${branch:-detached}"
echo "info: worktree changes $dirty_count"

if [[ "$CHECK_REMOTE" -eq 1 ]]; then
  if git -C "$REPO_ROOT" ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
    echo "ok: GitHub remote reachable"
  else
    echo "FAILED: GitHub remote is not reachable" >&2
    failures=$((failures + 1))
  fi
fi

if [[ "$failures" -ne 0 ]]; then
  echo "Codex project check FAILED ($failures issue(s))." >&2
  exit 1
fi

echo "Codex project check passed."
