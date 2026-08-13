#!/usr/bin/env bash

# Source this file in shells that do not apply devcontainer remoteEnv:
#   source .devcontainer/activate-tools.sh

set -Eeuo pipefail

readonly AHA_TOOLS_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$AHA_TOOLS_REPO_ROOT/.devcontainer/ensure-gh.sh"

for candidate in \
  "${AHA_GH_BIN_DIR:-}" \
  "/workspace/bin" \
  "$AHA_TOOLS_REPO_ROOT/.tools/bin"; do
  [[ -n "$candidate" && -x "$candidate/gh" ]] || continue
  export PATH="$candidate:$PATH"
  break
done

if ! command -v gh >/dev/null 2>&1; then
  echo "[tools] GitHub CLI activation failed." >&2
  return 1 2>/dev/null || exit 1
fi

gh --version | head -n 1
