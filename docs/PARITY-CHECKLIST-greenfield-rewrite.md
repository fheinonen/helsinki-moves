# Parity Checklist: Greenfield Rewrite

**Status:** In review  
**Date:** 2026-03-07

This checklist compares the rewrite in `web/src/` against legacy user-visible behavior and test coverage found in:

- `web/tests/e2e/*.js`
- `web/tests/*.test.js`
- legacy app modules under `web/scripts/app/`
- legacy API handlers under `web/api/v1/`

## Covered In Rewrite

### Core app shell

- [x] App opens and shows primary controls.
- [x] Mode changer is visible and interactive.
- [x] Departure cards render line, destination, and relative time.
- [x] Desktop and mobile shell geometry are covered.
- [x] Desktop and mobile visual baselines exist.

### Departures and stop/filter flow

- [x] Initial departures load from current location.
- [x] Permission-denied location state shows recovery guidance.
- [x] Refresh falls back to the last known location when geolocation becomes unavailable.
- [x] Refresh updates to a new nearest stop after location movement.
- [x] Refresh retries geolocation once with high accuracy before falling back to the last known location.
- [x] Mode switching reloads departures.
- [x] Stop selection reloads departures for the chosen stop.
- [x] Line and destination filters reload results and sanitize stale values.
- [x] Grouped nearby stops and counted filter options are covered.
- [x] Newer departures requests replace older pending requests.
- [x] Older failures do not overwrite newer successful departures.
- [x] A transient departures failure is retried once.
- [x] First stop-mode load ignores stale stop query context and picks the nearest returned stop.
- [x] Stop query state is restored only after explicit user re-selection.
- [x] Mode switch active-state feedback updates before a slow departures reload finishes.
- [x] Firefox disables heavy glass blur on shell cards through a rewrite-native stylesheet fallback.
- [x] Light-theme controls avoid washed or white-flash frames during filter interaction.

### Voice search

- [x] Voice action shows unavailable state when browser support is missing.
- [x] Browser recorder cleans up microphone tracks.
- [x] Voice recording is single-flight.
- [x] Voice recording requests preferred 16 kHz mono microphone constraints with browser audio processing hints.
- [x] Successful transcription resolves a place and loads departures there.
- [x] Voice line-intent transcripts resolve to the winning nearby mode by departure time.
- [x] Ambiguous location results show choice buttons and resolve after selection.
- [x] Speech transcription upstream failure shows a stable error message.
- [x] Unsupported speech transcription offers typed fallback and continues with the typed query.
- [x] Geocode failure shows a stable error message.
- [x] Transient geocode failure is retried once.
- [x] Microphone permission denial and missing-microphone failures map to stable user-facing messages.
- [x] Voice browser scenarios pass on desktop Chromium.
- [x] Voice browser scenarios pass on mobile Chromium.

### API boundary behavior

- [x] Departures route rejects invalid coordinates.
- [x] Departures route returns grouped stop/filter payloads.
- [x] Geocode route validates query input and resolves place payloads.
- [x] Client error route rejects malformed JSON and sanitizes payloads.
- [x] Speech transcription route validates payloads and returns configured/upstream/no-speech responses.
- [x] Speech transcription timeout is deterministic in server tests.
- [x] Geocode timeout is deterministic in server tests.

## Legacy Behaviors Still Needing Explicit Parity Validation

These exist in legacy tests or modules but do not yet have direct rewrite coverage:

- none currently identified as release-critical parity gaps

## Legacy Behaviors Covered During T33

- [x] Refresh updates to a new nearest stop after location movement
- [x] Refresh falls back to the last known location when geolocation becomes unavailable
- [x] Refresh retries geolocation once with high accuracy before falling back to the last known location
- [x] First stop-mode load ignores stale stop query context and picks the nearest returned stop
- [x] Stop query state is restored only after explicit user re-selection
- [x] Voice line-intent transcripts resolve to the winning nearby mode
- [x] Voice microphone preflight requests preferred constraints and typed fallback continues when transcription is unavailable
- [x] Mode switch responsiveness budget is covered by a rewrite-native Playwright probe
- [x] Firefox glass-blur fallback is covered by a rewrite-native unit contract
- [x] Legacy light-theme flicker concern is covered by a rewrite-native controls stability probe

## Deliberate Rewrite Differences

- [x] Internal architecture changed completely: strict TypeScript modules, Hono routes, and store-driven shell replace legacy `window`-coordinated modules.
- [x] API wire compatibility is not preserved by requirement; user-visible parity is the goal.
- [x] Visuals are intentionally refreshed, with new rewrite baselines approved in `web/tests/e2e/ui-visual-regression.spec.ts-snapshots/`.

## Release Blockers Before Cutover

- [x] Performance release gates are defined for the rewrite.

## Performance Gates For Cutover

- [x] `npm run test:unit`
  Includes the Firefox glass-blur fallback contract and other rewrite-native unit performance contracts.
- [x] `npm run ui:perf`
  Required cutover gate for mode-switch responsiveness.
- [x] `npm run ui:flicker`
  Required cutover gate for light-theme controls stability during filter interaction.
- [x] `npm run perf:bundle`
  Required cutover gate for gzip bundle budgets.
- [x] `npm run ui:check`
  Required cutover gate for final visual stability on approved desktop/mobile baselines.

## Historical Diagnostics Only

- [x] `web/tests/e2e/mode-switch-performance.spec.js`
  Superseded by rewrite-native `tests/e2e/mode-switch-responsiveness.spec.ts`.
- [x] `web/tests/e2e/light-filter-panel-flicker.spec.js`
  Superseded by rewrite-native `tests/e2e/light-theme-controls-stability.spec.ts`; the old collapsible-panel probe no longer matches the rewrite UI.
- [x] `web/tests/firefox-performance.test.js`
  Treated as historical reference except for the glass-blur fallback, which is now covered by rewrite-native unit tests.

## Suggested T33 Focus

1. Run the rewrite-native cutover gates as part of final local validation.
2. Keep the legacy `.js` probes as reference material only unless a concrete regression reappears.
3. Move release work to env validation and cutover preparation.
