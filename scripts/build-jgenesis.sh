#!/usr/bin/env bash
set -euo pipefail

# Builds jgenesis-web (WASM) inside Docker and writes runtime assets to dist/jgenesis.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$PROJECT_DIR/.tmp/jgenesis-build"
FRONTEND_DIR="$WORK_DIR/frontend/jgenesis-web"
TARGET_DIR="$PROJECT_DIR/dist/jgenesis"
ORIGINAL_DIR="$PROJECT_DIR/dist/original"
DOCKERFILE="$PROJECT_DIR/scripts/jgenesis-builder.Dockerfile"
PATCH_SCRIPT="$PROJECT_DIR/scripts/patch-jgenesis-web.mjs"
IMAGE_TAG="jgenesis-builder:latest"

if [[ ! -f "$DOCKERFILE" ]]; then
    echo "Missing Dockerfile: $DOCKERFILE" >&2
    exit 1
fi

if [[ ! -f "$PATCH_SCRIPT" ]]; then
    echo "Missing patch script: $PATCH_SCRIPT" >&2
    exit 1
fi

echo "Preparing workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"
mkdir -p "$ORIGINAL_DIR"

echo "Cloning jsgroth/jgenesis..."
git clone --depth=1 https://github.com/jsgroth/jgenesis.git "$WORK_DIR"

echo "Applying local jgenesis-web ROM-bytes patch..."
node "$PATCH_SCRIPT" "$WORK_DIR"

echo "Building Docker image (Rust nightly + wasm-pack)..."
docker build -t "$IMAGE_TAG" -f "$DOCKERFILE" "$PROJECT_DIR/scripts"

echo "Building jgenesis-web WASM via Docker..."
docker run --rm \
        -v "$WORK_DIR:/workspace" \
        -w /workspace/frontend/jgenesis-web \
        "$IMAGE_TAG" \
    bash -lc "export PATH=\"$PATH:/usr/local/cargo/bin:/root/.cargo/bin\" && RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web . -- -Z build-std=panic_abort,std"

if [[ ! -d "$FRONTEND_DIR/pkg" ]]; then
    echo "Expected build output not found: $FRONTEND_DIR/pkg" >&2
    exit 1
fi

if [[ -d "$TARGET_DIR" ]]; then
    find "$TARGET_DIR" -mindepth 1 -delete
fi

if [[ -d "$ORIGINAL_DIR" ]]; then
    find "$ORIGINAL_DIR" -mindepth 1 -delete
fi

echo "Copying build output (pkg/) to $TARGET_DIR..."
cp -R "$FRONTEND_DIR/pkg/"* "$TARGET_DIR/"

echo "Copying upstream jgenesis-web build layout to $ORIGINAL_DIR..."
mkdir -p "$ORIGINAL_DIR/pkg"
cp -R "$FRONTEND_DIR/pkg/"* "$ORIGINAL_DIR/pkg/"

if [[ -d "$FRONTEND_DIR/js" ]]; then
    mkdir -p "$ORIGINAL_DIR/js"
    cp "$FRONTEND_DIR/js/"*.js "$ORIGINAL_DIR/js/"
fi

if [[ -f "$FRONTEND_DIR/index.html" ]]; then
    cp "$FRONTEND_DIR/index.html" "$ORIGINAL_DIR/index.html"
fi

echo "Build complete. Output available in $TARGET_DIR"
echo "Upstream build snapshot available in $ORIGINAL_DIR"
