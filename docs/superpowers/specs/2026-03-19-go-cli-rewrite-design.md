# Go CLI Rewrite Design

## Summary

Replace the recently added Node-based `hm` CLI with a Go implementation that preserves the current user-facing contract while producing small standalone binaries for automated GitHub Releases.

The rewrite is scoped to the CLI only. The web app stays on its current Node/Vite stack, but CI must start validating the CLI as a first-class product on every push and pull request, and release tags must publish multi-platform binaries.

## Goals

- Preserve the current `hm` command surface exactly.
- Preserve the current output behavior exactly enough that existing examples and operator habits remain valid.
- Reduce standalone artifact size from Node SEA-sized binaries to native Go-sized binaries.
- Publish version-tagged GitHub Release assets for:
  - macOS arm64
  - macOS amd64
  - Linux amd64
  - Linux arm64
  - Windows amd64
- Use date-based versions in `yyyy.m.d` form, for example `2026.3.19`.
- Validate the CLI in CI as a first-class product alongside the existing web checks.

## Non-Goals

- Rewriting the web app or API in Go.
- Changing the API contract used by the CLI.
- Redesigning the CLI UX, flags, or output shape.
- Adding installers, package-manager formulas, or signing/notarization.

## User-Facing Contract

The Go CLI must replace `bin/hm.mjs` as the shipped implementation and preserve:

- command name: `hm`
- flags:
  - `--location`, `-l`
  - `--stop`, `-s`
  - `--line`, `-n`
  - `--mode`, `-m`
  - `--all`, `-a`
  - `--results`, `-r`
  - `--json`
  - `--help`, `-h`
- default API base:
  - `https://helsinkimoves.fheinonen.eu`
- environment override:
  - `HM_API_URL`
- exit-code behavior:
  - usage and validation failures return `2`
  - no results and unresolved location cases return `1`
  - successful results return `0`
- output behavior:
  - same help text semantics
  - same ambiguous location handling
  - same no-match handling
  - same table headings and layout shape
  - same JSON mode behavior
  - same warning behavior for partial `--all` failures

Minor differences in whitespace should be avoided. Parity tests should treat the current Node CLI behavior as the compatibility reference during migration.

## Architecture

The Go CLI should be a dedicated module under `cli/`, with a small executable entrypoint and focused internal packages. The runtime flow remains:

1. parse flags and validate input
2. resolve location from geocode API
3. fetch departures for one mode, one stop, or all modes
4. format and print JSON or table output
5. return the correct exit code

### Package Boundaries

- `cli/cmd/hm/main.go`
  - thin executable entrypoint
  - constructs runtime dependencies
  - calls application runner
  - exits with returned code
- `cli/internal/app`
  - top-level orchestration
  - CLI options model
  - primary run function
- `cli/internal/args`
  - flag parsing
  - validation
  - help text generation
- `cli/internal/api`
  - HTTP client
  - geocode and departures request/response types
  - timeout and error normalization
- `cli/internal/departures`
  - one-mode, stop-precision, and all-mode query flows
  - result merging and sort order
- `cli/internal/format`
  - table rendering
  - relative and absolute departure-time formatting
- `cli/internal/testing`
  - test-only API surface for scenario runner glue
  - helpers that decouple scenario language from package internals

Each package should stay narrow enough that behavior is understandable without reading unrelated code. The executable should depend on abstractions owned by the application layer, not on direct formatting or HTTP concerns scattered through `main.go`.

## API Behavior

The Go CLI continues to call the existing public endpoints:

- `GET /api/v1/geocode?q=...`
- `GET /api/v1/departures?lat=...&lon=...&mode=...`

Behavior details to preserve:

- `--stop` still performs the nearest-stop precision flow:
  - first departures request without `stopId`
  - second departures request with the nearest stop id when available
- `--all` still queries `bus`, `tram`, `rail`, and `metro`, merges fulfilled departures, sorts by `departureIso`, and prints warnings for failed modes
- mode validation remains limited to `bus`, `tram`, `rail`, and `metro`
- `--json` prints machine-readable JSON and suppresses table output

## Testing Strategy

The repository instructions require BDD/TDD, so the rewrite should be test-first and scenario-driven.

### Scenario Layer

Natural-language Given/When/Then scenarios should define user-visible behavior without referencing package names or implementation details. Coverage should include:

- help output
- missing-argument failure
- invalid flag failure
- invalid mode failure
- quoted vs unquoted location behavior
- successful location lookup and table output
- `--line` filtering passthrough
- `--stop` nearest-stop precision
- `--all` merged multi-mode output
- JSON output
- ambiguous geocode handling
- no-location-found handling
- no-departures handling
- API HTTP failure
- network failure
- exit-code matrix
- time formatting thresholds

### Glue Layer

A custom Go scenario runner should connect scenario steps to real production code. It must not be a no-op or placeholder layer. The runner should:

- create a real application instance with injected HTTP base URL, clock, stdout, and stderr
- execute the same application entry function used by `main`
- assert on exit code and output

### Test Scope

- unit tests for focused parsing, formatting, and API behavior
- scenario tests for end-to-end CLI behavior in-process
- a smoke build in CI to prove the binary compiles
- release-workflow smoke tests that execute each built artifact with `--help`

The current Node CLI tests provide the behavior reference during migration, but the final steady state should be Go-native tests only.

## CI And Release Design

### CI

The existing `.github/workflows/ci.yml` should be extended so the CLI is validated as a first-class product on every push and pull request. The CLI checks should be separate from the web jobs so failures are easy to attribute.

Expected CLI CI stages:

- setup Go toolchain with a pinned version
- run Go formatting and vet/lint-equivalent checks
- run CLI scenario and unit tests with failure-focused output
- build the local platform binary as a smoke check

### Tagged Releases

Add a dedicated release workflow triggered by version tags in `yyyy.m.d` form.

The release workflow should:

- validate the tag format early
- build binaries for:
  - `darwin-arm64`
  - `darwin-amd64`
  - `linux-amd64`
  - `linux-arm64`
  - `windows-amd64`
- name artifacts consistently, for example:
  - `hm_2026.3.19_darwin_arm64.tar.gz`
  - `hm_2026.3.19_windows_amd64.zip`
- run a smoke command on each built binary:
  - `hm --help`
- publish the archives to a GitHub Release tied to the tag

No signing or notarization is included. Release notes can stay minimal and machine-generated at first.

## Migration Plan Shape

Implementation should follow this high-level sequence:

1. add Go module and failing behavior scenarios
2. implement minimal Go runner to satisfy help and validation scenarios
3. port API flows and table formatting under scenario coverage
4. add CI validation jobs for the CLI
5. add tag-triggered multi-platform release workflow
6. remove `bin/hm.mjs` and `bin/hm.test.mjs` after Go parity is established
7. update README CLI documentation to reference the Go binary release path

The Node implementation should remain only until the Go version has behavior parity. It is a migration oracle, not a long-term dual-runtime strategy.

## Risks And Mitigations

### Output Drift

Risk:
small formatting differences could break parity expectations.

Mitigation:
capture exact output expectations in scenarios before porting logic, and compare against the current CLI behavior while both implementations exist.

### Time Formatting Instability

Risk:
relative-time output depends on the current clock and local formatting.

Mitigation:
inject a deterministic clock into formatting tests and scenario runs.

### Cross-Platform Archive Differences

Risk:
release asset naming or executable bit handling could drift by platform.

Mitigation:
test archive naming explicitly in the workflow and smoke-run the extracted binary on each matrix target.

### Scope Creep

Risk:
the rewrite could expand into API or UX changes.

Mitigation:
treat exact contract preservation as the acceptance gate and defer enhancements until after replacement.

## Acceptance Criteria

The work is complete when:

- the Go CLI replaces the Node CLI as the shipped implementation
- the Go CLI preserves current `hm` behavior and exit codes
- CI validates the CLI on every push and pull request
- a tag like `2026.3.19` produces downloadable release binaries for all agreed targets
- README instructions reflect the new CLI implementation and release path
