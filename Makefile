# @wasm-gaming/jgenesis-wasm — build & preview
#
#   make build     Full build → dist/ (TypeScript SDK + WASM)
#   make preview   Serve dist/ at http://localhost:$(PORT)
#
# build-demo preserves upstream jgenesis index output by moving dist/index.html
# to dist/original/index.html before writing this package's demo shell.

BIN := node_modules/.bin

PORT ?= 8025

.PHONY: build build-sdk build-lib build-manifest build-demo build-wasm \
	preview typecheck test release-check i install clean help

i: install
install: ## Install dev dependencies
	npm install

node_modules: package.json
	npm install
	@touch node_modules

build: build-wasm build-sdk ## Full build → dist/ (WASM first, then SDK/demo)

build-sdk: build-lib build-manifest build-demo ## TypeScript + manifest + demo shell

build-lib: node_modules ## Compile SDK/options/manifest → dist/jgenesis/
	$(BIN)/tsc -p tsconfig.json

build-manifest: build-lib ## Serialize typed manifest → dist/manifest.json
	node scripts/emit-manifest.mjs

build-demo: build-lib ## Compile demo + keep upstream index at dist/original/index.html
	@mkdir -p dist/original
	@if [ -f dist/index.html ]; then mv dist/index.html dist/original/index.html; fi
	$(BIN)/tsc -p tsconfig.demo.json
	cp src/demo/index.html dist/index.html

build-wasm: ## Build jgenesis runtime artifacts via Docker wrapper
	bash scripts/build-docker.sh

typecheck: build-lib
	$(BIN)/tsc -p tsconfig.json --noEmit
	$(BIN)/tsc -p tsconfig.demo.json --noEmit

test: typecheck

release-check: test
	npm config get registry
	npm pack --dry-run

preview: ## Serve dist/ with COOP/COEP headers
	@echo "Serving dist/ at http://localhost:$(PORT) (Ctrl+C to stop)"
	python3 scripts/preview-server.py --port $(PORT) --directory dist

clean: ## Remove build outputs
	@if [ -d dist ]; then find dist -mindepth 1 -delete; fi

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
