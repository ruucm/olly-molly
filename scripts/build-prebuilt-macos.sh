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

STANDALONE_STATIC="${ROOT_DIR}/.next/standalone/.next/static"
rm -rf "${STANDALONE_STATIC}"
mkdir -p "$(dirname "${STANDALONE_STATIC}")"
cp -R "${ROOT_DIR}/.next/static" "${STANDALONE_STATIC}"

ARCH="$(uname -m)"
case "${ARCH}" in
  arm64) ARCH_TAG="arm64" ;;
  x86_64) ARCH_TAG="x64" ;;
  *) echo "Unsupported macOS arch: ${ARCH}" ; exit 1 ;;
esac

VERSION="$(node -p "require('./package.json').version")"
TARBALL="${OUT_DIR}/olly-molly-darwin-${ARCH_TAG}.tar.gz"

echo "Packaging ${TARBALL}..."
tar -czf "${TARBALL}" \
  .next/standalone \
  package.json \
  public

echo "Done: ${TARBALL}"
