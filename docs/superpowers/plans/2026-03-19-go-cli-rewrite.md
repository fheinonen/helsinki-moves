# Go CLI Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node-based `hm` CLI with a Go implementation that preserves the current contract, validates in CI, and ships tagged multi-platform release binaries.

**Architecture:** Build a dedicated Go module under `cli/` with a thin `main`, a small application runner, focused packages for argument parsing, API access, departures orchestration, and formatting, plus an in-process BDD runner that drives real production code through Given/When/Then scenarios. Keep the web app unchanged except for extending CI and adding a dedicated tag-triggered release workflow for CLI binaries.

**Tech Stack:** Go, Go standard library, GitHub Actions, existing public HTTP API, Jujutsu for local commits

---

### Task 1: Bootstrap The Go Module And First Failing BDD Scenarios

**Files:**
- Create: `cli/go.mod`
- Create: `cli/cmd/hm/main.go`
- Create: `cli/internal/app/run.go`
- Create: `cli/internal/args/parse.go`
- Create: `cli/internal/args/help.go`
- Create: `cli/internal/testing/runtime.go`
- Create: `cli/tests/bdd/help_and_validation.bdd_test.go`
- Create: `cli/tests/bdd/help_and_validation.scenarios.txt`

- [ ] **Step 1: Write the failing help and validation scenarios**

```text
Feature: hm help and validation

Scenario: Show help text
  Given the Helsinki Moves API base URL is "http://127.0.0.1:1"
  When the user runs hm with arguments:
    """
    --help
    """
  Then stdout contains "Usage: hm [OPTIONS]"
  And the exit code is 0

Scenario: Reject missing query input
  Given the Helsinki Moves API base URL is "http://127.0.0.1:1"
  When the user runs hm with arguments:
    """

    """
  Then stderr contains "Missing --location or --stop"
  And the exit code is 2

Scenario: Reject an invalid mode
  Given the Helsinki Moves API base URL is "http://127.0.0.1:1"
  When the user runs hm with arguments:
    """
    -l Kamppi -m ferry
    """
  Then stderr contains "Invalid mode"
  And stderr contains "bus, tram, rail, metro"
  And the exit code is 2
```

- [ ] **Step 2: Run the BDD test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestHelpAndValidationScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... no required module provides package ...
```

- [ ] **Step 3: Write the minimal module, runner, and parser implementation**

```go
// cli/internal/app/run.go
package app

import "io"

type RunOptions struct {
	Args   []string
	Stdout io.Writer
	Stderr io.Writer
}

func Run(opts RunOptions) int {
	return 2
}
```

- [ ] **Step 4: Run the BDD test to verify it still fails for behavior, not missing code**

Run:

```bash
cd cli && go test ./tests/bdd -run TestHelpAndValidationScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected stdout to contain "Usage: hm [OPTIONS]"
```

- [ ] **Step 5: Implement just enough help and validation behavior to pass**

```go
// cli/cmd/hm/main.go
package main

import (
	"os"

	"hm/cli/internal/app"
)

func main() {
	os.Exit(app.Run(app.RunOptions{
		Args:   os.Args[1:],
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	}))
}
```

- [ ] **Step 6: Run the BDD test to verify it passes**

Run:

```bash
cd cli && go test ./tests/bdd -run TestHelpAndValidationScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected: no output

- [ ] **Step 7: Commit**

```bash
jj commit cli docs/superpowers/plans/2026-03-19-go-cli-rewrite.md -m "feat: bootstrap Go hm CLI"
```

### Task 2: Port Geocode Query Outcomes Under Scenario Coverage

**Files:**
- Modify: `cli/internal/app/run.go`
- Create: `cli/internal/api/client.go`
- Create: `cli/internal/api/types.go`
- Modify: `cli/internal/testing/runtime.go`
- Create: `cli/tests/bdd/geocode_outcomes.bdd_test.go`
- Create: `cli/tests/bdd/geocode_outcomes.scenarios.txt`

- [ ] **Step 1: Write the failing geocode outcome scenarios**

```text
Feature: hm geocode outcomes

Scenario: Print departures heading after resolving a known address
  Given the Helsinki Moves API responds to geocode for "Vihdintie 17"
  And the departures API returns one departure for "BUS"
  When the user runs hm with arguments:
    """
    -l Vihdintie 17
    """
  Then stdout contains "Vihdintie 17, Helsinki"
  And stdout contains "LINE"
  And the exit code is 0

Scenario: Show ambiguous location choices
  Given the Helsinki Moves API returns ambiguous geocode choices for "Vihdintie"
  When the user runs hm with arguments:
    """
    -l Vihdintie
    """
  Then stderr contains "Multiple matches"
  And stderr contains "Vihdintie 17, Helsinki"
  And the exit code is 1

Scenario: Show no-match failure
  Given the Helsinki Moves API returns no geocode match for "asdfghjkl"
  When the user runs hm with arguments:
    """
    -l asdfghjkl
    """
  Then stderr contains "No location found"
  And the exit code is 1
```

- [ ] **Step 2: Run the geocode BDD test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestGeocodeOutcomeScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected stdout to contain "Vihdintie 17, Helsinki"
```

- [ ] **Step 3: Implement the minimal geocode client and application flow**

```go
// cli/internal/api/client.go
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

func (c Client) Geocode(ctx context.Context, query string) (GeocodeResponse, error) {
	return GeocodeResponse{}, nil
}
```

- [ ] **Step 4: Run the geocode BDD test to verify it passes**

Run:

```bash
cd cli && go test ./tests/bdd -run TestGeocodeOutcomeScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected: no output

- [ ] **Step 5: Add focused unit tests for API error normalization**

```go
func TestGeocodeReturnsAPIErrorBody(t *testing.T) {
	// Assert that HTTP 500 becomes "API error (500): ..."
}
```

- [ ] **Step 6: Run the unit tests**

Run:

```bash
cd cli && go test ./internal/api 2>&1 | rg -v '^(ok|\\?)'
```

Expected: no output

- [ ] **Step 7: Commit**

```bash
jj commit cli -m "feat: port hm geocode flow"
```

### Task 3: Port Single-Mode Departures, JSON Output, And Stop Precision

**Files:**
- Modify: `cli/internal/app/run.go`
- Create: `cli/internal/departures/service.go`
- Modify: `cli/internal/api/client.go`
- Create: `cli/internal/format/table.go`
- Create: `cli/internal/format/time.go`
- Create: `cli/tests/bdd/departures_single_mode.bdd_test.go`
- Create: `cli/tests/bdd/departures_single_mode.scenarios.txt`
- Create: `cli/internal/format/table_test.go`
- Create: `cli/internal/format/time_test.go`

- [ ] **Step 1: Write the failing departures scenarios**

```text
Feature: hm departures in one mode

Scenario: Pass the line filter through to the API
  Given the Helsinki Moves API responds to geocode for "Vihdintie 17"
  And the departures API records request parameters and returns line "57"
  When the user runs hm with arguments:
    """
    -l Vihdintie 17 --line 57
    """
  Then the departures request contains line "57"
  And the exit code is 0

Scenario: Use a two-phase stop lookup for --stop
  Given the Helsinki Moves API responds to geocode for "Talontie"
  And the first departures response exposes nearest stop id "HSL:5678"
  And the second departures response returns stop code "Ta0123"
  When the user runs hm with arguments:
    """
    --stop Talontie
    """
  Then the departures API is called twice
  And the second departures request contains stopId "HSL:5678"
  And the exit code is 0

Scenario: Print JSON when --json is requested
  Given the Helsinki Moves API responds to geocode for "Vihdintie 17"
  And the departures API returns one departure for "BUS"
  When the user runs hm with arguments:
    """
    -l Vihdintie 17 --json
    """
  Then stdout is valid JSON
  And stdout contains "\"line\":\"57\""
  And the exit code is 0
```

- [ ] **Step 2: Run the departures BDD test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestSingleModeDepartureScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected departures request to contain line "57"
```

- [ ] **Step 3: Implement minimal departures orchestration and formatting**

```go
// cli/internal/departures/service.go
func QuerySingleMode(ctx context.Context, client api.Client, location api.Location, opts QueryOptions) (api.DeparturesResponse, error) {
	return client.Departures(ctx, DeparturesRequest{
		Latitude:  location.Latitude,
		Longitude: location.Longitude,
		Mode:      strings.ToUpper(opts.Mode),
		Line:      opts.Line,
		Results:   opts.Results,
		StopID:    opts.StopID,
	})
}
```

- [ ] **Step 4: Add the failing time-format unit tests**

```go
func TestFormatDepartureTimeUsesRelativeTimeUnderFifteenMinutes(t *testing.T) {}

func TestFormatDepartureTimeUsesAbsoluteClockAtFifteenMinutesOrMore(t *testing.T) {}
```

- [ ] **Step 5: Run the format unit tests to verify they fail**

Run:

```bash
cd cli && go test ./internal/format -run TestFormatDepartureTime 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... undefined: FormatDepartureTime
```

- [ ] **Step 6: Implement minimal time and table formatting**

```go
func FormatDepartureTime(now time.Time, departure time.Time) string {
	diff := departure.Sub(now)
	if diff < 0 {
		return "now"
	}
	if diff < 15*time.Minute {
		return fmt.Sprintf("%d min", int(math.Round(diff.Minutes())))
	}
	return departure.Format("15:04")
}
```

- [ ] **Step 7: Run the departures BDD and format unit tests**

Run:

```bash
cd cli && go test ./tests/bdd -run TestSingleModeDepartureScenarios 2>&1 | rg -v '^(ok|\\?)'
cd cli && go test ./internal/format 2>&1 | rg -v '^(ok|\\?)'
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
jj commit cli -m "feat: port hm departures and formatting"
```

### Task 4: Port All-Modes, Failure Handling, And Exit-Code Parity

**Files:**
- Modify: `cli/internal/app/run.go`
- Modify: `cli/internal/departures/service.go`
- Modify: `cli/internal/api/client.go`
- Create: `cli/tests/bdd/all_modes_and_failures.bdd_test.go`
- Create: `cli/tests/bdd/all_modes_and_failures.scenarios.txt`
- Create: `cli/internal/departures/service_test.go`

- [ ] **Step 1: Write the failing all-modes and failure scenarios**

```text
Feature: hm all modes and failures

Scenario: Merge departures from all modes
  Given the Helsinki Moves API responds to geocode for "Pasila"
  And the departures API returns bus and tram departures for all-mode queries
  When the user runs hm with arguments:
    """
    -l Pasila --all
    """
  Then stdout contains "All departures"
  And stdout contains "MODE"
  And stdout contains "57"
  And stdout contains "9"
  And the exit code is 0

Scenario: Warn when one mode fails during --all
  Given the Helsinki Moves API responds to geocode for "Pasila"
  And the departures API fails for mode "TRAM" during all-mode queries
  When the user runs hm with arguments:
    """
    -l Pasila --all
    """
  Then stderr contains "Warning: tram departures unavailable"
  And stdout contains "57"
  And the exit code is 0

Scenario: Return exit code 2 on network failure
  Given the Helsinki Moves API is unreachable
  When the user runs hm with arguments:
    """
    -l Vihdintie 17
    """
  Then stderr contains "Could not reach Helsinki Moves API"
  And the exit code is 2
```

- [ ] **Step 2: Run the all-modes BDD test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestAllModesAndFailureScenarios 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected stdout to contain "All departures"
```

- [ ] **Step 3: Implement the minimal all-modes query and warning behavior**

```go
func QueryAllModes(ctx context.Context, client api.Client, location api.Location, opts QueryOptions) (MergedResult, error) {
	// fan out to bus, tram, rail, metro
	// merge fulfilled departures
	// sort by departureIso
	// collect warning modes
	return MergedResult{}, nil
}
```

- [ ] **Step 4: Add a failing unit test for merge ordering**

```go
func TestQueryAllModesSortsMergedDeparturesByDepartureISO(t *testing.T) {}
```

- [ ] **Step 5: Run the unit test to verify it fails**

Run:

```bash
cd cli && go test ./internal/departures -run TestQueryAllModesSortsMergedDeparturesByDepartureISO 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected sorted departure order
```

- [ ] **Step 6: Implement just enough merge logic to pass**

```go
slices.SortFunc(result.Departures, func(a, b api.Departure) int {
	return strings.Compare(a.DepartureISO, b.DepartureISO)
})
```

- [ ] **Step 7: Run the BDD and unit tests**

Run:

```bash
cd cli && go test ./tests/bdd -run TestAllModesAndFailureScenarios 2>&1 | rg -v '^(ok|\\?)'
cd cli && go test ./internal/departures 2>&1 | rg -v '^(ok|\\?)'
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
jj commit cli -m "feat: complete hm all-mode and failure parity"
```

### Task 5: Add First-Class CLI Validation To CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `cli/Makefile`
- Create: `cli/scripts/test-ci.sh`

- [ ] **Step 1: Write the failing CI contract test**

```go
// cli/tests/bdd/ci_contract.bdd_test.go
func TestCLIProjectBuildsFromRepositoryRoot(t *testing.T) {}
```

- [ ] **Step 2: Run the CI contract test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestCLIProjectBuildsFromRepositoryRoot 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... missing root-invocable build command
```

- [ ] **Step 3: Add root-stable CLI commands and CI job**

```yaml
  cli-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: cli/go.mod
      - run: ./cli/scripts/test-ci.sh
```

- [ ] **Step 4: Run the CLI CI script locally**

Run:

```bash
./cli/scripts/test-ci.sh
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
jj commit .github/workflows/ci.yml cli -m "ci: validate Go hm CLI in CI"
```

### Task 6: Add Tagged Multi-Platform CLI Releases

**Files:**
- Create: `.github/workflows/cli-release.yml`
- Create: `cli/scripts/build-release.sh`
- Create: `cli/scripts/archive-release.sh`

- [ ] **Step 1: Write the failing release workflow contract test**

```text
Scenario: A date tag produces platform archives
  Given the release version is "2026.3.19"
  When the release matrix builds darwin arm64
  Then the archive name is "hm_2026.3.19_darwin_arm64.tar.gz"
```

- [ ] **Step 2: Run the release naming test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestReleaseArchiveNaming 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... expected archive name "hm_2026.3.19_darwin_arm64.tar.gz"
```

- [ ] **Step 3: Add the release build and archive scripts**

```bash
GOOS="$1" GOARCH="$2" go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o "$OUT"
```

- [ ] **Step 4: Add the tag-triggered workflow**

```yaml
on:
  push:
    tags:
      - '*'
```

- [ ] **Step 5: Validate the scripts locally for one platform**

Run:

```bash
VERSION=2026.3.19 ./cli/scripts/build-release.sh linux amd64
VERSION=2026.3.19 ./cli/scripts/archive-release.sh linux amd64
```

Expected: one archive under `cli/dist/` named `hm_2026.3.19_linux_amd64.tar.gz`

- [ ] **Step 6: Commit**

```bash
jj commit .github/workflows/cli-release.yml cli -m "ci: add tagged hm release workflow"
```

### Task 7: Remove The Node CLI And Update Documentation

**Files:**
- Delete: `bin/hm.mjs`
- Delete: `bin/hm.test.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-03-19-go-cli-rewrite-design.md`

- [ ] **Step 1: Write the failing documentation parity check**

```go
func TestREADMEReferencesGoCLIReleaseFlow(t *testing.T) {}
```

- [ ] **Step 2: Run the documentation parity test to verify it fails**

Run:

```bash
cd cli && go test ./tests/bdd -run TestREADMEReferencesGoCLIReleaseFlow 2>&1 | rg -v '^(ok|\\?)'
```

Expected:

```text
FAIL ... README still points to bin/hm.mjs
```

- [ ] **Step 3: Remove the Node CLI files and update README**

```markdown
## CLI

`hm` is implemented in Go and published as standalone release binaries for macOS, Linux, and Windows.
```

- [ ] **Step 4: Run the full CLI validation suite**

Run:

```bash
cd cli && go test ./... 2>&1 | rg -v '^(ok|\\?)'
./cli/scripts/test-ci.sh
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
jj commit README.md bin cli -m "refactor: replace Node hm CLI with Go implementation"
```

### Task 8: Final Verification Before Completion

**Files:**
- Modify: `docs/superpowers/plans/2026-03-19-go-cli-rewrite.md`

- [ ] **Step 1: Run repository verification relevant to this change**

Run:

```bash
cd cli && go test ./... 2>&1 | rg -v '^(ok|\\?)'
./cli/scripts/test-ci.sh
```

Expected: no output

- [ ] **Step 2: Build one local release artifact**

Run:

```bash
VERSION=2026.3.19 ./cli/scripts/build-release.sh linux amd64
VERSION=2026.3.19 ./cli/scripts/archive-release.sh linux amd64
```

Expected: archive exists at `cli/dist/hm_2026.3.19_linux_amd64.tar.gz`

- [ ] **Step 3: Check working copy changes**

Run:

```bash
jj status
```

Expected: only intended CLI, CI, workflow, and README changes remain

- [ ] **Step 4: Mark the plan complete**

```markdown
- [x] Task 1
- [x] Task 2
- [x] Task 3
- [x] Task 4
- [x] Task 5
- [x] Task 6
- [x] Task 7
- [x] Task 8
```
