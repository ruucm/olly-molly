#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_TARBALL="${ROOT_DIR}/dist/prebuilt/olly-molly-darwin-$(uname -m | sed 's/arm64/arm64/;s/x86_64/x64/').tar.gz"
TARGET_DIR="${ROOT_DIR}/dist/prebuilt/run"

TARBALL_PATH="${1:-${DEFAULT_TARBALL}}"
PORT="${PORT:-1234}"

if [[ ! -f "${TARBALL_PATH}" ]]; then
  echo "Tarball not found: ${TARBALL_PATH}"
  echo "Usage: $(basename "$0") [/absolute/path/to/olly-molly-darwin-*.tar.gz]"
  exit 1
fi

rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"
tar -xzf "${TARBALL_PATH}" -C "${TARGET_DIR}"

echo "Starting prebuilt olly-molly..."
echo "URL: http://localhost:${PORT}"
NODE_ENV=production PORT="${PORT}" node "${TARGET_DIR}/.next/standalone/server.js"
