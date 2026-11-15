# @wasm-gaming/jgenesis-wasm — build & preview
#
#   make build      Full build → dist/ (TypeScript SDK + WASM)
#   make build-sdk  TypeScript + the contract runtime + the app + demo page (no WASM)
#   make test       Type-check, then the tests against the built package
#   make preview    Serve dist/ at http://localhost:$(PORT)

BIN := node_modules/.bin

PORT ?= 8026

# The contract package: its runtime ships beside the SDK (build-specs).
SPECS := node_modules/@wasm-gaming/engine-specs

.PHONY: build build-sdk build-lib build-specs build-app build-demo build-wasm \
	preview typecheck test release-check i install clean help

i: install
install: ## Install dev dependencies
	npm install

node_modules: package.json
	npm install
	@touch node_modules

build: build-wasm build-sdk ## Full build → dist/ (WASM first, then SDK/demo)

build-sdk: build-lib build-specs build-app build-demo ## The published SDK: TypeScript + the contract runtime + the app, and the demo page

build-lib: node_modules ## Compile SDK/options → dist/jgenesis/
	$(BIN)/tsc -p tsconfig.json

build-specs: build-lib ## Ship the contract runtime beside the SDK and import it relatively
	cp $(SPECS)/dist/engine-specs.js dist/jgenesis/engine-specs.js
	node scripts/localize-specs.mjs dist/jgenesis

build-app: ## The engine's own app (suspend points + pause menu) → dist/jgenesis/app/
	rm -rf dist/jgenesis/app
	mkdir -p dist/jgenesis/app
	cp src/app/app.js src/app/app.css dist/jgenesis/app/

build-demo: build-lib ## The no-build demo page → dist/index.html (+ the COOP/COEP service worker for the threaded build)
	cp src/demo/index.html dist/index.html
	mkdir -p dist/vendor
	cp src/demo/vendor/coi-serviceworker.min.js dist/vendor/

build-wasm: ## Build jgenesis runtime artifacts via Docker wrapper
	bash scripts/build-jgenesis-docker.sh

typecheck: build-lib
	$(BIN)/tsc -p tsconfig.json --noEmit

test: typecheck build-sdk ## Type-check, then run tests/ against the built package
	node --test tests/*.test.mjs

release-check: test
	npm config get registry
	npm pack --dry-run

preview: ## Serve dist/ with COOP/COEP headers
	@echo "Serving dist/ at http://localhost:$(PORT) (Ctrl+C to stop)"
	python3 scripts/preview-server.py --port $(PORT) --directory dist

preview.single: ## Serve dist/ without COOP/COEP headers (single-threaded WASM)
	@echo "Serving dist/ at http://localhost:$(PORT) (Ctrl+C to stop)"
	python3 -m http.server $(PORT) --directory dist

clean: ## Remove build outputs
	@if [ -d dist ]; then find dist -mindepth 1 -delete; fi

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
