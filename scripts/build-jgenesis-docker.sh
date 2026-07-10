#!/usr/bin/env bash
set -euo pipefail

# Build jgenesis runtime artifacts using the local project Docker wrapper.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BUILD_SCRIPT="${PROJECT_DIR}/scripts/build-jgenesis.sh"

if [[ ! -x "${LOCAL_BUILD_SCRIPT}" ]]; then
  echo "Local jgenesis build script not found or not executable: ${LOCAL_BUILD_SCRIPT}" >&2
  exit 1
fi

echo "[jgenesis] Running local Docker build..."
"${LOCAL_BUILD_SCRIPT}"

echo "[jgenesis] Runtime artifacts available in ${PROJECT_DIR}/dist/jgenesis"
