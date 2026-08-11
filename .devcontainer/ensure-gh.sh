#!/usr/bin/env bash
set -Eeuo pipefail

readonly GH_KEYRING="/etc/apt/keyrings/githubcli-archive-keyring.gpg"
readonly GH_SOURCE="/etc/apt/sources.list.d/github-cli.list"

if command -v gh >/dev/null 2>&1; then
  gh --version | head -n 1
  exit 0
fi

echo "[codespaces] GitHub CLI missing; repairing installation..."

sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee "$GH_KEYRING" >/dev/null
sudo chmod go+r "$GH_KEYRING"
echo "deb [arch=$(dpkg --print-architecture) signed-by=$GH_KEYRING] https://cli.github.com/packages stable main" | sudo tee "$GH_SOURCE" >/dev/null
sudo apt-get update
sudo apt-get install -y gh

if ! command -v gh >/dev/null 2>&1; then
  echo "[codespaces] GitHub CLI repair failed: gh is still unavailable." >&2
  exit 1
fi

gh --version | head -n 1
