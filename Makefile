.DEFAULT_GOAL := help

PACKAGE := @sincpro/mobile
VERSION := $(shell node -p "require('./package.json').version")

prepare-environment:
	@pipx install pre-commit
	@pipx ensurepath
	@pre-commit install

init: prepare-environment
	@echo "Installing Node.js dependencies..."
	@yarn install


typecheck:
	@npx tsc --noEmit

doctor:
	@bash scripts/doctor.sh

format:
	@echo "🔤 Ordenando imports + auto-fix (eslint)..."
	@npx eslint . --fix
	@echo "🎨 Formateando (prettier)..."
	@npx prettier --experimental-cli --write "**/*.{ts,tsx,js,jsx,json,yml,yaml,md}" --ignore-path .prettierignore --ignore-unknown
	@echo "Check types after formatting..."
	@make typecheck

build:
	@echo "🏗️  Compilando $(PACKAGE) -> dist (tsc + tsc-alias)..."
	@rm -rf dist
	@npx tsc -p tsconfig.build.json
	@npx tsc-alias -p tsconfig.build.json
	@echo "✓ Build listo en ./dist (JS + .d.ts, alias @ resuelto a relativo)"

test:
	@echo "Running tests..."

verify-format: format doctor
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
	@rm -rf dist node_modules
	@echo "✓ Cleaned"

.PHONY: prepare-environment init format typecheck doctor build test verify-format update-version publish deploy clean
