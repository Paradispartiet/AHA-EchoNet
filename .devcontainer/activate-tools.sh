#!/usr/bin/env bash

# Source this file in shells that do not apply devcontainer remoteEnv:
#   source .devcontainer/activate-tools.sh

aha_activate_repository_tools() {
  local repo_root=""
  local resolved=""
  local bin_dir=""
  local path_entry=""
  local normalized_path=""
  local status=0

  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || status=$?
  if (( status == 0 )); then
    resolved="$(bash "$repo_root/.devcontainer/ensure-gh.sh" --print-path)" || status=$?
  fi
  if (( status == 0 )) && [[ ! -x "$resolved" ]]; then
    echo "[tools] GitHub CLI activation returned an invalid binary: $resolved" >&2
    status=1
  fi
  if (( status == 0 )); then
    bin_dir="$(dirname "$resolved")"
    while IFS= read -r path_entry; do
      [[ "$path_entry" == "$bin_dir" ]] && continue
      normalized_path="${normalized_path:+$normalized_path:}$path_entry"
    done < <(printf '%s' "${PATH:-}" | tr ':' '\n')
    export PATH="$bin_dir${normalized_path:+:$normalized_path}"
    hash -r 2>/dev/null || true
    "$resolved" --version | head -n 1 || status=$?
  fi

  unset -f aha_activate_repository_tools
  return "$status"
}

aha_activate_repository_tools
