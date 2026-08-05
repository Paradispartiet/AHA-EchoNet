#!/usr/bin/env bash
set -Eeuo pipefail

readonly PLAYWRIGHT_VERSION="1.62.1"
readonly CA_FILE="/etc/ssl/certs/ca-certificates.crt"
readonly PROFILE_FILE="/etc/profile.d/aha-echonet-tools.sh"

cd "$(git rev-parse --show-toplevel)"

export NODE_EXTRA_CA_CERTS="$CA_FILE"
export SSL_CERT_FILE="$CA_FILE"
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT="180000"

proxy_env=(
  "HTTP_PROXY=${HTTP_PROXY:-${http_proxy:-}}"
  "HTTPS_PROXY=${HTTPS_PROXY:-${https_proxy:-}}"
  "ALL_PROXY=${ALL_PROXY:-${all_proxy:-}}"
  "NO_PROXY=${NO_PROXY:-${no_proxy:-}}"
)

echo "[codespaces] Installing system certificates and browser dependencies..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl
sudo update-ca-certificates

if [[ ! -r "$CA_FILE" ]]; then
  echo "[codespaces] Missing readable CA bundle: $CA_FILE" >&2
  exit 1
fi

sudo tee "$PROFILE_FILE" >/dev/null <<'EOF'
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"
export SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt"
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT="180000"
EOF
sudo chmod 0644 "$PROFILE_FILE"

echo "[codespaces] Installing project dependencies..."
npm ci

installed_version=""
if command -v playwright >/dev/null 2>&1; then
  installed_version="$(playwright --version 2>/dev/null | awk '{print $2}')"
fi

if [[ "$installed_version" != "$PLAYWRIGHT_VERSION" ]]; then
  echo "[codespaces] Installing Playwright CLI $PLAYWRIGHT_VERSION globally..."
  sudo env \
    "PATH=$PATH" \
    "NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS" \
    "SSL_CERT_FILE=$SSL_CERT_FILE" \
    "PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=$PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT" \
    "${proxy_env[@]}" \
    npm install --global "playwright@$PLAYWRIGHT_VERSION"
fi

echo "[codespaces] Installing Chromium system dependencies..."
sudo env \
  "PATH=$PATH" \
  "NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS" \
  "SSL_CERT_FILE=$SSL_CERT_FILE" \
  "PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=$PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT" \
  "${proxy_env[@]}" \
  playwright install-deps chromium

echo "[codespaces] Downloading Chromium..."
for attempt in 1 2 3; do
  if playwright install chromium; then
    break
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo "[codespaces] Chromium download failed after $attempt attempts." >&2
    exit 1
  fi

  wait_seconds=$((attempt * 15))
  echo "[codespaces] Download failed; retrying in ${wait_seconds}s..." >&2
  sleep "$wait_seconds"
done

echo "[codespaces] Verifying tools..."
gh --version | head -n 1
playwright --version
playwright install --list

echo "[codespaces] GitHub CLI and Playwright Chromium are ready."
