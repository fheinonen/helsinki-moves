# Rewrite Tracker: Greenfield Rewrite

**Author:** Felix Heinonen + Codex  
**Date:** 2026-03-07  
**Status:** Active

## Purpose

This file is the live execution source of truth for the greenfield rewrite.

Use alongside:

- `docs/EPICS-greenfield-rewrite.md`
- `docs/SPRINT-PLAN-greenfield-rewrite.md`

Update this file whenever a rewrite task:

- starts
- completes
- becomes blocked
- changes scope

## Current Milestone

- `Milestone 3`: Voice parity works

## In Progress

- `T35` Validate Vercel env vars, preview deploy, and production deploy plan

## Next Up

- run local release validation with the current `.env`
- confirm matching Vercel project env before production cutover

## Blocked

- none

## Done

- Planning docs created:
  - `docs/EPICS-greenfield-rewrite.md`
  - `docs/SPRINT-PLAN-greenfield-rewrite.md`
- `T1` completed:
  - `Vite + TypeScript` scaffold created
  - `index.html`, `vite.config.ts`, `tsconfig.json`, and `src/client/main.ts` added
- `T2` completed:
  - `Hono` app scaffold created in `src/server/`
  - `api/[[route]].ts` added for Vercel routing
- `T3` completed:
  - `Vitest` configured
  - failure-only Vitest filter script added
  - first unit BDD scenarios added and passing
- `T4` completed:
  - `Playwright` moved to TypeScript config with desktop and mobile projects
  - first Chromium browser smoke scenario passing
- `T5` completed:
  - `web/README.md` rewritten for the new architecture
  - `web/src/README.md` added with client/server/shared boundary rules
- `T6` completed:
  - `ci`, `ci:syntax`, `ci:unit`, `ci:coverage`, and `ci:e2e` scripts added
- `T7` completed:
  - shared stop, filter, and error domain types added
  - geocode contract added for new server validation path
- `T8` completed:
  - manual `geocode` and `client-error` validators added
  - validators are covered by fail-first BDD scenarios and wired into routes
- `T9` completed:
  - shared client-error sanitization utility now redacts secrets and truncates deep branches predictably
  - direct BDD coverage added for sanitizer behavior
- `T10` completed:
  - `client-error` route now handles malformed JSON and invalid payloads with controlled `400` responses
  - accepted payloads stay sanitized before logging
- `T11` completed:
  - `geocode` route now uses contract-first validation and explicit success/error responses
- `T12` completed:
  - route and contract BDD coverage now exists for departures validation, geocode success/error, client-error validation, sanitization, and malformed JSON handling
- `T13` completed:
  - Digitransit service wrapper added under `src/server/services/digitransit/client.ts`
  - multi-stop request builder and upstream normalization are isolated from route code
- `T14` completed:
  - departures normalization, stop grouping, and filter option derivation added under `src/server/services/digitransit/departures-normalizer.ts`
  - BDD coverage added for grouped selectable stops and filter option ordering
- `T15` completed:
  - `/api/v1/departures` now uses a dedicated departures service instead of a stub route
  - route-level BDD coverage added for no-nearby-mode responses and selected-stop departures/filter options
- `T16` completed:
  - root app store added at `src/client/app/app-store.ts`
  - app state now owns mode, station, filter options, theme, and stops
- `T17` completed:
  - app shell now renders from the root store instead of preview-only local state
  - bootstrap now hydrates theme from storage and renders through the store-backed shell
- `T18` completed:
  - BDD coverage added for app-store state application, shell rendering from store data, and theme bootstrap
- `T19` completed:
  - location permission denied, unavailable, and success states are handled through the app controller
  - refresh flow now stores coordinates and emits distinct UI status states
- `T20` completed:
  - departures loading orchestration now owns request replacement and abortable in-flight fetches
  - loading flow is driven through the root store instead of preview data
- `T21` completed:
  - shell renders departure cards only from ready state
  - loading/status UI is separated cleanly from departures presentation
- `T22` completed:
  - stop selector added as a dedicated view module
  - selecting a stop clears line/destination filters and reloads departures for that stop
- `T23` completed:
  - line and destination filter chips added with deterministic filter summary text
  - stale filter selections are sanitized against the latest response
- `T24` completed:
  - browser coverage added for denied location, mode switching, and stop/filter interaction flows
  - new interaction scenarios pass on desktop and mobile Chromium when run sequentially
- `T25` completed:
  - `ui:geometry`, `ui:baseline`, `ui:check`, and `ui:fast` scripts added for the rewrite shell
  - deterministic desktop and mobile baselines generated and verified for the new app shell
- `T28` completed:
  - speech transcription contract, validator, and configurable OpenAI-compatible service added
  - `/api/v1/speech-transcribe` now validates payloads and returns configured, empty-speech, and upstream-failure responses deterministically
- `T26` completed:
  - voice availability and phase are now explicit app state
  - the shell renders a real voice action with checking, unavailable, listening, and transcribing labels
- `T27` completed:
  - browser voice recorder service added with deterministic short-capture behavior and microphone track cleanup
  - controller runs a listening -> transcribing -> idle lifecycle and stores the pending transcript query
- `T29` completed:
  - `/api/v1/geocode` now uses a real Digitransit-backed geocode service with query normalization, candidate ranking, and nearby-stop validation
  - voice search now resolves transcribed place queries through geocoding, stores ambiguity choices, and lets the user select a matching location before loading departures
- `T31` partially completed:
  - browser coverage now exists for unsupported voice, successful geocode-backed resolution, ambiguous location choice, and transcription upstream failure on desktop and mobile Chromium
  - remaining work is the reliability sweep around retries, timeouts, and repeated actions
- `T30` partially completed:
  - stale departures failures are now covered so an older rejected request cannot overwrite a newer success
  - voice search is now single-flight at the controller level so duplicate start requests do not trigger duplicate captures
  - speech transcription service now supports deterministic timeout injection and maps upstream aborts to a stable timeout error
  - departures loading now retries a single transient non-abort failure before surfacing an error
  - voice geocode resolution now retries a single transient failure and maps final geocode errors to a stable user-facing message
  - Digitransit geocoding now supports deterministic timeout injection for server-side hardening
- `T31` completed:
  - browser coverage now exists for unsupported voice, successful geocode-backed resolution, stable geocode failure, ambiguous location choice, and transcription upstream failure
  - the voice browser scenarios pass on both desktop and mobile Chromium
- `T32` completed:
  - parity checklist created at `docs/PARITY-CHECKLIST-greenfield-rewrite.md`
  - covered rewrite flows, uncovered legacy behaviors, and deliberate rewrite deviations are now explicit
- `T33` partially completed:
  - refresh now reuses the last known location when geolocation becomes unavailable after an initial successful load
  - parity coverage added at unit and browser level for the refresh-fallback flow
  - rewrite-native browser coverage now exists for moving-location nearest-stop refresh
  - minimal URL query-state support added so mode hydrates from the URL and selected stop/filter state syncs back into the URL
  - stale stop query context is ignored on first stop-mode load, and stop query state returns only after explicit re-selection
  - legacy voice line-intent parsing and resolution are now ported with fail-first unit coverage and browser coverage on desktop/mobile Chromium
  - legacy microphone preflight parity is now covered with preferred input constraints, typed fallback on unsupported transcription, and stable microphone error mapping
  - legacy mode-switch responsiveness is now covered by a rewrite-native Chromium Playwright probe and `ui:perf` script
  - Firefox glass-blur performance fallback is now covered by rewrite CSS and a unit contract
  - legacy light-theme flicker concern is now covered by a rewrite-native controls stability probe and `ui:flicker` script
  - legacy high-accuracy geolocation retry during refresh is now covered in unit and browser tests
- `T33` completed:
  - parity gaps found in QA and e2e are now closed for the current rewrite scope
- `T34` completed:
  - a typed bundle-budget evaluator now exists under `src/shared/performance/bundle-budget.ts`
  - `tools/check-bundle-budgets.mjs` now enforces gzip budgets against built `dist/assets`
  - `npm run perf:bundle` now checks the current build against the rewrite bundle budgets
  - rewrite-native performance gates are now defined: `test:unit`, `ui:perf`, `ui:flicker`, `perf:bundle`, and `ui:check`
  - Digitransit nearby-stop discovery now uses a short in-memory cache for identical `lat/lon/radius` lookups while departures remain uncached so mode switches can reuse static stop discovery without serving stale realtime departures
- `T35` partially completed:
  - release checklist added at `docs/RELEASE-CHECKLIST-greenfield-rewrite.md`
  - required local and Vercel env vars are now documented explicitly
  - local validation gates and post-deploy smoke checks are now documented for cutover
  - a single `npm run release:validate` command now runs the rewrite-native local cutover gates in sequence
  - `npm run env:check` now enforces required runtime secrets before cutover validation
  - `npm run env:check` now reads the local `.env` and currently passes with the required rewrite secrets
  - deploy plan added at `docs/DEPLOY-PLAN-greenfield-rewrite.md`
  - rewrite env var names are now locked for local and Vercel use
  - preview runtime compatibility fixed for the concrete TypeScript Vercel entrypoints by declaring nested ESM package scope under `web/api/` and `web/src/` and by locking server/shared relative imports to explicit `.js` specifiers
  - a fresh preview deployment now serves healthy Hono responses for `/api/health`, `/api/v1/departures`, `/api/v1/geocode`, and `/api/v1/client-error`
  - the public preview alias now points to a fresh deployment with the nearby-stop cache optimization applied
- `T36` partially completed:
  - live deployment smoke config added at `web/playwright.smoke.config.ts`
  - automated live smoke scenario added at `web/tests/smoke/live-deploy-smoke.spec.ts`
  - `SMOKE_BASE_URL=... npm run smoke:live` is now available for preview and production smoke checks
- `T37` completed:
  - `/api/v1/departures` now ships from a TypeScript Vercel entrypoint backed by the Hono app
  - `/api/health` now ships from a concrete TypeScript Vercel entrypoint backed by the Hono app
  - `/api/v1/geocode`, `/api/v1/client-error`, and `/api/v1/speech-transcribe` now also ship from concrete TypeScript Vercel entrypoints backed by the Hono app
  - the legacy CommonJS departures implementation moved out of `web/api/` into `web/legacy-api/` so it no longer shadows the live route
  - legacy CommonJS route handlers for departures, geocode, client-error, and speech transcription moved into `web/legacy-api/` so they no longer shadow the live routes
  - contract coverage added for the Vercel departures, health, geocode, client-error, and speech-transcribe entrypoints and legacy helper tests were repointed to the moved modules
  - a scoped `api/v1/[...route].ts` catch-all was tested and rejected because `vercel dev` did not dispatch live `/api/v1/*` traffic to it reliably in this repo; concrete entrypoints remain the working deployment shape
- Post-parity fix completed:
  - browser voice recorder auto-stop window increased so voice capture no longer ends before the user can start speaking
  - recorder contract coverage added for the minimum speech window and verified against browser voice e2e

## Decisions Locked

- Rewrite replaces the app in `web/`
- Full parity includes voice flows
- No backward compatibility is required
- Runtime secrets will exist in both Vercel and local env
- Cutover happens only after parity is complete and local validation is done
- `mode` changer and departure cards are required UI elements
- Visuals may change
- `TypeScript` uses strict mode
- Optimize for strongest long-term architecture
- Follow strong and strict BDD/TDD

## Open Questions

- Whether current URL-state behavior should be preserved exactly
- Whether existing tests are migration references or only behavior references

## Task Status Legend

- `todo`
- `in_progress`
- `blocked`
- `done`

## Task Board

| ID | Title | Sprint | Status | Depends On | Notes |
|---|---|---|---|---|---|
| T1 | Create `Vite + TypeScript` frontend scaffold | 1 | done | - | Bootstrap client build in `web/` |
| T2 | Create `Hono` API scaffold on Vercel | 1 | done | - | Bootstrap server app and route mounting |
| T3 | Add `Vitest`, coverage config, and failure-only test scripts | 1 | done | T1, T2 | Must honor repo failure-only output rules |
| T4 | Add `Playwright` with mobile and desktop projects | 1 | done | T1 | Keep deterministic browser config |
| T5 | Define repo structure, path aliases, and module boundary docs | 1 | done | - | Document final TypeScript structure |
| T6 | Add CI commands for syntax, unit, coverage, and e2e | 1 | done | T3, T4 | Include strict typecheck |
| T7 | Define shared domain types for modes, stops, departures, filters, and errors | 2 | done | - | No `any`, strict TS only |
| T8 | Build query/body parsing utilities and manual validation helpers | 2 | done | T7 | Prefer small explicit validators |
| T9 | Build shared sanitization utilities for telemetry/error payloads | 2 | done | T7 | Shared by client-error path |
| T10 | Implement `client-error` route in Hono | 2 | done | T8, T9 | Thin route only |
| T11 | Implement `geocode` route in Hono | 2 | done | T8 | Contract-first route |
| T12 | Build API contract/unit tests for all completed routes | 2 | done | T10, T11 | BDD-first |
| T13 | Implement Digitransit service wrapper and request builders | 3 | done | T8 | Isolate upstream integration |
| T14 | Implement departures normalization, stop grouping, and filter option derivation | 3 | done | T13 | Core domain path |
| T15 | Implement `/api/v1/departures` route | 3 | done | T14 | Preserve product behavior, not wire compatibility |
| T16 | Build frontend app bootstrap and custom store | 3 | done | T7 | Explicit state/actions only |
| T17 | Build shell layout, theme initialization, and mode selector UI | 3 | done | T16 | Must include mode changer |
| T18 | Add unit tests for store and departures domain logic | 3 | done | T14, T16 | BDD-first |
| T19 | Implement location permission, denied, unavailable, and refresh flows | 4 | done | T16 | Distinct UX states |
| T20 | Implement departure loading orchestration with polling and request replacement | 4 | done | T15, T16, T19 | Avoid duplicate timers and races |
| T21 | Implement departures list rendering and timing presentation | 4 | done | T20 | Must include departure cards |
| T22 | Implement stop selector for stop-based modes | 4 | done | T20 | Stop-mode parity path |
| T23 | Implement line and destination filters plus filter summary | 4 | done | T20 | Derived state stays deterministic |
| T24 | Add e2e coverage for location, mode switching, and filter interactions | 4 | done | T19, T20, T21, T22, T23 | Mobile and desktop |
| T25 | Add visual regression baselines for mobile and desktop | 4 | done | T21, T22, T23 | Deterministic snapshots |
| T26 | Implement voice capability detection and UI state | 5 | done | T16 | Supported-browser only |
| T27 | Implement recording flow and browser cleanup paths | 5 | done | T26 | Real browser path |
| T28 | Implement speech transcription proxy route | 5 | done | T8 | Validated upload path |
| T29 | Implement transcription result handling and ambiguity resolution | 5 | done | T27, T28 | Includes voice selection flow |
| T30 | Add retry/timeouts/race-condition hardening for API and UI flows | 5 | done | T20, T28, T29 | Reliability sweep |
| T31 | Add e2e coverage for voice success/failure and upstream failure states | 5 | done | T27, T28, T29, T30 | Full parity includes voice |
| T32 | Build parity checklist against current app behavior | 6 | done | T25, T31 | Release gate |
| T33 | Fix parity gaps found in QA and e2e | 6 | done | T32 | Rewrite-native parity coverage now includes voice, refresh, and stability gaps |
| T34 | Add perf budget checks and run optimization pass | 6 | done | T33 | Rewrite-native performance gates and bundle budgets are in place |
| T35 | Validate Vercel env vars, preview deploy, and production deploy plan | 6 | in_progress | T33 | Local env gate now passes; preview runtime compatibility is fixed and a fresh preview is healthy; waiting on full release validation and production confirmation |
| T36 | Production cutover and smoke verification | 6 | todo | T34, T35 | Run only after local validation |
| T37 | Cut `/api/v1/departures` over to the Hono server route | 6 | done | T15 | Legacy JS route moved out of `web/api/` to stop Vercel shadowing |
