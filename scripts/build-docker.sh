#!/usr/bin/env bash
set -euo pipefail

# Build jgenesis runtime artifacts through the existing workspace builder and
# mirror them into this subproject's dist/ folder.
#
# Side effect required by this subproject workflow:
#   - if a generated index exists from the runtime build, write it to dist/index.html
#     so Makefile's build-demo can relocate it to dist/original/index.html.

ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "${ENGINE_DIR}/../.." && pwd)"
ROOT_BUILD_SCRIPT="${ROOT_DIR}/scripts/engines/jgenesis/build-jgenesis-docker.sh"
SHARED_RUNTIME_DIR="${ROOT_DIR}/public/console/shared/jgenesis"
MEGADRIVE_INDEX="${ROOT_DIR}/public/console/megadrive/index.html"
OUT_DIR="${ENGINE_DIR}/dist/jgenesis"

if [[ ! -x "${ROOT_BUILD_SCRIPT}" ]]; then
  echo "jgenesis build wrapper not found or not executable: ${ROOT_BUILD_SCRIPT}" >&2
  exit 1
fi

echo "[jgenesis] Running workspace jgenesis Docker build..."
"${ROOT_BUILD_SCRIPT}"

if [[ ! -d "${SHARED_RUNTIME_DIR}" ]]; then
  echo "Expected runtime artifacts not found: ${SHARED_RUNTIME_DIR}" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
cp -R "${SHARED_RUNTIME_DIR}/"* "${OUT_DIR}/"

if [[ -f "${MEGADRIVE_INDEX}" ]]; then
  mkdir -p "${ENGINE_DIR}/dist"
  cp "${MEGADRIVE_INDEX}" "${ENGINE_DIR}/dist/index.html"
fi

echo "[jgenesis] Runtime artifacts mirrored to ${OUT_DIR}"
