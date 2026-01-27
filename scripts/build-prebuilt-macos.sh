#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist/prebuilt"

cd "${ROOT_DIR}"
mkdir -p "${OUT_DIR}"

echo "Installing dependencies..."
npm install

echo "Building Next.js..."
npm run build

# Find the actual standalone app directory
STANDALONE_APP_DIR="${ROOT_DIR}/.next/standalone"
if [[ ! -f "${STANDALONE_APP_DIR}/server.js" ]]; then
  echo "Error: Could not find server.js in standalone output"
  exit 1
fi

STANDALONE_STATIC="${STANDALONE_APP_DIR}/.next/static"
rm -rf "${STANDALONE_STATIC}"
mkdir -p "$(dirname "${STANDALONE_STATIC}")"
cp -R "${ROOT_DIR}/.next/static" "${STANDALONE_STATIC}"

# Also copy public folder to standalone app dir
cp -R "${ROOT_DIR}/public" "${STANDALONE_APP_DIR}/public"

ARCH="$(uname -m)"
case "${ARCH}" in
  arm64) ARCH_TAG="arm64" ;;
  x86_64) ARCH_TAG="x64" ;;
  *) echo "Unsupported macOS arch: ${ARCH}" ; exit 1 ;;
esac

VERSION="$(node -p "require('./package.json').version")"
TARBALL="${OUT_DIR}/olly-molly-darwin-${ARCH_TAG}.tar.gz"

# Create a clean tarball structure
STAGING_DIR="${OUT_DIR}/staging"
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}/.next/standalone"

# Copy standalone contents (flatten the nested path)
# Use rsync to include hidden files like .next
rsync -a "${STANDALONE_APP_DIR}/" "${STAGING_DIR}/.next/standalone/"
cp "${ROOT_DIR}/package.json" "${STAGING_DIR}/"

echo "Packaging ${TARBALL}..."
tar -czf "${TARBALL}" -C "${STAGING_DIR}" .

rm -rf "${STAGING_DIR}"
echo "Done: ${TARBALL}"
