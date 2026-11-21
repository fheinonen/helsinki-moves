SHELL := /bin/sh

GO ?= go
GOFILES := $(shell find . -type f -name '*.go' | sort)

.PHONY: ci fmt-check vet test build

ci: fmt-check vet test build

fmt-check:
	@files="$$(gofmt -s -l $(GOFILES))"; \
	if [ -n "$$files" ]; then \
		printf '%s\n' "$$files"; \
		exit 1; \
	fi

vet:
	@$(GO) vet ./...

test:
	@tmp="$$(mktemp)"; \
	status=0; \
	if $(GO) test -count=1 ./... >"$$tmp" 2>&1; then \
		grep -Ev '^(ok|\?|PASS|=== RUN|--- PASS|--- SKIP|coverage:)' "$$tmp" || true; \
	else \
		status=$$?; \
		grep -Ev '^(ok|\?|PASS|=== RUN|--- PASS|--- SKIP|coverage:)' "$$tmp" || true; \
	fi; \
	rm -f "$$tmp"; \
	exit $$status

build:
	@tmpdir="$$(mktemp -d)"; \
	status=0; \
	$(GO) build -o "$$tmpdir/hm" ./cmd/hm || status=$$?; \
	rm -rf "$$tmpdir"; \
	exit $$status
