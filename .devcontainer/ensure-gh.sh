#!/usr/bin/env bash
set -Eeuo pipefail

# Keep one reproducible fallback for runtimes where the devcontainer feature is
# not applied (for example transient coding-agent workspaces).
readonly GH_FALLBACK_VERSION="${AHA_GH_VERSION:-2.94.0}"
readonly GH_MINIMUM_VERSION="2.92.0"
readonly GH_KEYRING="/etc/apt/keyrings/githubcli-archive-keyring.gpg"
readonly GH_SOURCE="/etc/apt/sources.list.d/github-cli.list"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

version_at_least() {
  local actual="${1#v}"
  local required="${2#v}"
  [[ "$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n 1)" == "$required" ]]
}

gh_version() {
  "$1" version 2>/dev/null | awk 'NR == 1 { sub(/^gh version /, ""); print $1 }'
}

usable_gh() {
  local candidate="$1"
  [[ -x "$candidate" ]] || return 1
  local version
  version="$(gh_version "$candidate")"
  [[ -n "$version" ]] && version_at_least "$version" "$GH_MINIMUM_VERSION"
}

find_usable_gh() {
  local candidate=""
  if command -v gh >/dev/null 2>&1; then
    candidate="$(command -v gh)"
    if usable_gh "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    echo "[tools] GitHub CLI at $candidate is older than required $GH_MINIMUM_VERSION; upgrading." >&2
  fi

  for candidate in \
    "${AHA_GH_BIN_DIR:-}/gh" \
    "/workspace/bin/gh" \
    "$REPO_ROOT/.tools/bin/gh"; do
    [[ "$candidate" == "/gh" ]] && continue
    if usable_gh "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

choose_local_bin_dir() {
  local candidate=""
  for candidate in \
    "${AHA_GH_BIN_DIR:-}" \
    "/workspace/bin" \
    "$REPO_ROOT/.tools/bin"; do
    [[ -n "$candidate" ]] || continue
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

repair_with_apt() {
  command -v sudo >/dev/null 2>&1 || return 1
  command -v apt-get >/dev/null 2>&1 || return 1
  sudo -n true >/dev/null 2>&1 || return 1

  echo "[tools] Repairing GitHub CLI with the official APT repository..." >&2
  sudo apt-get update >&2
  sudo apt-get install -y ca-certificates curl >&2
  sudo install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee "$GH_KEYRING" >/dev/null
  sudo chmod go+r "$GH_KEYRING"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=$GH_KEYRING] https://cli.github.com/packages stable main" | sudo tee "$GH_SOURCE" >/dev/null
  sudo apt-get update >&2
  sudo apt-get install -y gh >&2

  local repaired=""
  for repaired in /usr/bin/gh /usr/local/bin/gh "$(command -v gh 2>/dev/null || true)"; do
    if [[ -n "$repaired" ]] && usable_gh "$repaired"; then
      printf '%s\n' "$repaired"
      return 0
    fi
  done
  return 1
}

install_local_release() {
  command -v curl >/dev/null 2>&1 || {
    echo "[tools] curl is required for the local GitHub CLI fallback." >&2
    return 1
  }
  command -v tar >/dev/null 2>&1 || {
    echo "[tools] tar is required for the local GitHub CLI fallback." >&2
    return 1
  }
  command -v sha256sum >/dev/null 2>&1 || {
    echo "[tools] sha256sum is required to verify the GitHub CLI release." >&2
    return 1
  }

  local machine=""
  case "$(uname -m)" in
    x86_64|amd64) machine="amd64" ;;
    aarch64|arm64) machine="arm64" ;;
    *)
      echo "[tools] Unsupported GitHub CLI architecture: $(uname -m)" >&2
      return 1
      ;;
  esac

  local bin_dir=""
  bin_dir="$(choose_local_bin_dir)" || {
    echo "[tools] No writable directory is available for a local GitHub CLI installation." >&2
    return 1
  }

  local archive="gh_${GH_FALLBACK_VERSION}_linux_${machine}.tar.gz"
  local checksums="gh_${GH_FALLBACK_VERSION}_checksums.txt"
  local release_url="https://github.com/cli/cli/releases/download/v${GH_FALLBACK_VERSION}"
  local temp_dir=""
  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$temp_dir"' RETURN

  echo "[tools] Installing checksum-verified GitHub CLI $GH_FALLBACK_VERSION in $bin_dir..." >&2
  curl --fail --location --silent --show-error --retry 3 --retry-delay 2 --output "$temp_dir/$archive" "$release_url/$archive"
  curl --fail --location --silent --show-error --retry 3 --retry-delay 2 --output "$temp_dir/$checksums" "$release_url/$checksums"

  local expected=""
  local actual=""
  expected="$(awk -v name="$archive" '$2 == name { print $1 }' "$temp_dir/$checksums")"
  actual="$(sha256sum "$temp_dir/$archive" | awk '{ print $1 }')"
  if [[ -z "$expected" || "$actual" != "$expected" ]]; then
    echo "[tools] GitHub CLI checksum verification failed for $archive." >&2
    return 1
  fi

  tar --no-same-owner -xzf "$temp_dir/$archive" -C "$temp_dir"
  install -m 0755 "$temp_dir/gh_${GH_FALLBACK_VERSION}_linux_${machine}/bin/gh" "$bin_dir/gh"
  usable_gh "$bin_dir/gh" || {
    echo "[tools] Local GitHub CLI installation is not executable or is too old." >&2
    return 1
  }
  printf '%s\n' "$bin_dir/gh"
}

resolve_gh() {
  local resolved=""
  if resolved="$(find_usable_gh)"; then
    printf '%s\n' "$resolved"
    return
  elif resolved="$(repair_with_apt)"; then
    :
  else
    resolved="$(install_local_release)"
  fi

  if ! usable_gh "$resolved"; then
    echo "[tools] GitHub CLI repair failed: no usable gh binary was found." >&2
    return 1
  fi

  printf '%s\n' "$resolved"
}

main() {
  local resolved=""
  resolved="$(resolve_gh)" || return 1

  if [[ "${1:-}" == "--print-path" ]]; then
    printf '%s\n' "$resolved"
    return 0
  fi

  "$resolved" --version | head -n 1
  if [[ ":$PATH:" != *":$(dirname "$resolved"):"* ]]; then
    echo "[tools] For this shell, run: export PATH=\"$(dirname "$resolved"):\$PATH\""
  fi
}

main "$@"
