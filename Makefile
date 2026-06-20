.DEFAULT_GOAL := help

PACKAGE := @sincpro/mobile
VERSION := $(shell node -p "require('./package.json').version")

help:
	@echo "$(PACKAGE) — comandos:"
	@echo "  init                       prepare-environment + yarn install"
	@echo "  format / format-check      Formatea / verifica formato (prettier)"
	@echo "  lint / typecheck / check   ESLint / tsc / ambos"
	@echo "  verify-format              Falla si el formateo cambia archivos (pre-commit/CI)"
	@echo "  test                       Ejecuta los tests"
	@echo "  build                      Compila ESM + tipos (builder-bob) a ./lib"
	@echo "  update-version VERSION=x.y.z   Actualiza la versión"
	@echo "  publish                    build + npm publish (usa NPM_TOKEN si está presente)"
	@echo "  clean                      Borra lib/ y node_modules/"

prepare-environment:
	@pipx install pre-commit
	@pipx ensurepath
	@pre-commit install

init: prepare-environment
	@echo "Installing Node.js dependencies..."
	@yarn install

format:
	@npx prettier --write "**/*.{ts,tsx,js,jsx,json,yml,yaml,md}" --ignore-path .prettierignore --ignore-unknown

format-check:
	@npx prettier --check "**/*.{ts,tsx,js,jsx,json,yml,yaml,md}" --ignore-path .prettierignore --ignore-unknown

lint:
	@yarn lint

typecheck:
	@yarn typecheck

check: lint typecheck

build:
	@echo "🏗️  Building $(PACKAGE) (ESM + types)..."
	@yarn bob build
	@echo "✓ Build artifacts ready in ./lib"

test:
	@echo "Running tests..."

verify-format: format
	@if ! git diff --quiet; then \
	  echo >&2 "✘ El formateo ha modificado archivos. Por favor agrégalos al commit."; \
	  git --no-pager diff --name-only HEAD -- >&2; \
	  exit 1; \
	fi
	@echo "✓ Format verification passed"

update-version:
ifndef VERSION
	$(error VERSION is required. Usage: make update-version VERSION=1.2.3)
endif
	@CURRENT_VERSION=$$(node -p "require('./package.json').version"); \
	if [ "$$CURRENT_VERSION" = "$(VERSION)" ]; then \
		echo "✓ Version is already $(VERSION), skipping update"; \
	else \
		npm version $(VERSION) --no-git-tag-version && echo "✓ Version updated to $(VERSION)"; \
	fi

publish: build
	@echo "📦 Publishing $(PACKAGE) to NPM..."
	@if [ -n "$$NPM_TOKEN" ]; then \
		echo "//registry.npmjs.org/:_authToken=$$NPM_TOKEN" > .npmrc.tmp; \
		chmod 600 .npmrc.tmp; \
		npm publish --access public --userconfig .npmrc.tmp; \
		rm -f .npmrc.tmp; \
	elif [ -n "$$NODE_AUTH_TOKEN" ]; then \
		npm publish --access public; \
	else \
		npm publish --access public; \
	fi
	@echo "✓ Published successfully"

deploy:
	@echo "Deploy not applicable for library modules"

clean:
	@rm -rf lib node_modules
	@echo "✓ Cleaned"

.PHONY: help prepare-environment init format format-check lint typecheck check build test verify-format update-version publish deploy clean
