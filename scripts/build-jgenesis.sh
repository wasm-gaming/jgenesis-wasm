#!/usr/bin/env bash
set -euo pipefail

# Builds jgenesis-web (WASM) inside Docker and writes runtime assets to dist/jgenesis.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$PROJECT_DIR/.tmp/jgenesis-build"
FRONTEND_DIR="$WORK_DIR/frontend/jgenesis-web"
THREADED_PKG_DIR="$FRONTEND_DIR/pkg-threaded"
SINGLE_PKG_DIR="$FRONTEND_DIR/pkg-single"
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
    bash -lc "export PATH=\"$PATH:/usr/local/cargo/bin:/root/.cargo/bin\" && \
        rm -rf pkg-threaded pkg-single && \
        RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir pkg-threaded . -- -Z build-std=panic_abort,std && \
        RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir pkg-single ."

if [[ ! -d "$THREADED_PKG_DIR" ]]; then
    echo "Expected threaded build output not found: $THREADED_PKG_DIR" >&2
    exit 1
fi

if [[ ! -d "$SINGLE_PKG_DIR" ]]; then
    echo "Expected single-thread build output not found: $SINGLE_PKG_DIR" >&2
    exit 1
fi

if [[ -d "$TARGET_DIR" ]]; then
    find "$TARGET_DIR" -mindepth 1 -delete
fi

if [[ -d "$ORIGINAL_DIR" ]]; then
    find "$ORIGINAL_DIR" -mindepth 1 -delete
fi

echo "Copying dual WASM build output to $TARGET_DIR..."
cp "$THREADED_PKG_DIR/jgenesis_web.js" "$TARGET_DIR/jgenesis.js"
cp "$THREADED_PKG_DIR/jgenesis_web_bg.wasm" "$TARGET_DIR/jgenesis.threaded.wasm"
cp "$SINGLE_PKG_DIR/jgenesis_web_bg.wasm" "$TARGET_DIR/jgenesis.single.wasm"
cp "$THREADED_PKG_DIR/jgenesis_web.d.ts" "$TARGET_DIR/jgenesis.d.ts"
cp "$THREADED_PKG_DIR/jgenesis_web_bg.wasm.d.ts" "$TARGET_DIR/jgenesis.threaded.wasm.d.ts"
cp "$THREADED_PKG_DIR/jgenesis_web_bg.wasm.d.ts" "$TARGET_DIR/jgenesis.single.wasm.d.ts"
cp "$THREADED_PKG_DIR/package.json" "$TARGET_DIR/package.json"
cp "$THREADED_PKG_DIR/README.md" "$TARGET_DIR/README.md"

if [[ -d "$THREADED_PKG_DIR/snippets" ]]; then
    mkdir -p "$TARGET_DIR/snippets"
    cp -R "$THREADED_PKG_DIR/snippets/"* "$TARGET_DIR/snippets/"
fi

echo "Copying upstream jgenesis-web build layout to $ORIGINAL_DIR..."
mkdir -p "$ORIGINAL_DIR/pkg"
cp -R "$THREADED_PKG_DIR/"* "$ORIGINAL_DIR/pkg/"

if [[ -d "$FRONTEND_DIR/js" ]]; then
    mkdir -p "$ORIGINAL_DIR/js"
    cp "$FRONTEND_DIR/js/"*.js "$ORIGINAL_DIR/js/"
fi

if [[ -f "$FRONTEND_DIR/index.html" ]]; then
    cp "$FRONTEND_DIR/index.html" "$ORIGINAL_DIR/index.html"
fi

echo "Build complete. Output available in $TARGET_DIR"
echo "Upstream build snapshot available in $ORIGINAL_DIR"
