# Epics: Greenfield Rewrite

**Author:** Felix Heinonen + Codex  
**Date:** 2026-03-07  
**Status:** Draft

## Scope

This epic list covers the greenfield rewrite of Helsinki Moves using:

- `Vite`
- `TypeScript`
- `Hono`
- small custom client store
- `Vitest`
- `Playwright`
- Vercel-only deployment

## Epic 1: Platform Foundation

**Goal:** establish a stable greenfield base that is easy to run, test, and deploy.

**Definition of Done**

- New app boots on a Vercel-compatible local dev workflow
- Frontend uses `Vite + TypeScript`
- API uses `Hono`
- `Vitest` and `Playwright` are installed and runnable
- CI commands are defined for syntax, unit, coverage, and e2e
- Repository structure and module boundaries are documented

## Epic 2: Shared Domain and Contracts

**Goal:** make request, response, and business rules explicit and typed before feature work expands.

**Definition of Done**

- Shared types exist for mode, stop, departure, filter options, and error states
- Mode rules for `RAIL`, `TRAM`, `METRO`, and `BUS` are centralized
- Typed contracts exist for all `/api/v1/*` endpoints
- Query parsing and validation rules are explicit and test-covered
- Shared sanitization utilities exist for client error and telemetry payloads
- API contracts can be consumed by both handlers and frontend clients

## Epic 3: API Rewrite

**Goal:** replace raw Vercel handler plumbing with a clean Hono-based API while preserving product behavior.

**Definition of Done**

- Hono app serves `/api/v1/departures`
- Hono app serves `/api/v1/geocode`
- Hono app serves `/api/v1/client-error`
- Hono app serves `/api/v1/speech-transcribe`
- Route handlers remain thin and delegate to services
- Digitransit and speech integrations are isolated from route glue
- Invalid, empty, upstream-failure, and no-results cases are test-covered

## Epic 4: Frontend Core

**Goal:** rebuild app bootstrap, shell, and state management with explicit typed modules and no implicit globals.

**Definition of Done**

- App initializes from URL and local storage
- Root store exposes subscribe/set/update semantics
- Derived selectors exist for active mode, filter summary, and visible departures
- Shell renders without data
- Theme behavior initializes deterministically before paint
- Mode selector updates app state without full page reload
- No frontend feature depends on `window` globals for cross-module coordination beyond bootstrap

## Epic 5: Departures and Filters

**Goal:** deliver parity for the main commuter flow: location to departures to stop/line/destination filtering.

**Definition of Done**

- Location permission, denied, unavailable, and refresh flows are implemented
- Client can request departures from current coordinates
- Loading, success, empty, and error states are distinct
- Departures render line, destination, timing, and stop context
- Stop-based modes support stop selection
- Line and destination filters update visible results immediately
- Invalid filters are cleared deterministically when data changes
- URL and local persistence restore app state safely
- Core user flows are covered by end-to-end and visual regression tests

## Epic 6: Voice Search

**Goal:** preserve and stabilize the voice-driven location and line-intent flows in the rewritten app.

**Definition of Done**

- Voice controls are enabled only on supported browsers
- Recording flow supports idle, recording, stopping, processing, success, cancel, and failure states
- Speech transcription proxy is implemented server-side with validated input
- Ambiguous transcription results trigger a deterministic selection flow
- No-result and error states are distinct and test-covered
- Browser cleanup and failure handling are deterministic

## Epic 7: Reliability, Observability, and Performance

**Goal:** harden the rewrite so it is cheaper to operate, easier to diagnose, and less likely to regress.

**Definition of Done**

- Structured telemetry and error logging are implemented
- Sensitive data is excluded from logs and telemetry payloads
- Retry behavior and timeout handling are explicit
- Duplicate refreshes and race conditions are covered by tests
- Bundle budget is measured in CI
- First-load and refresh-path performance are reviewed against budget targets
- Failure states do not corrupt persisted UI state

## Epic 8: Release and Cutover

**Goal:** verify parity, reduce release risk, and ship the rewritten app on Vercel.

**Definition of Done**

- Parity checklist exists against current product behavior
- Known deliberate deviations are documented
- Unit, coverage, syntax, e2e, and visual checks all pass
- Mobile and desktop baselines are approved
- Vercel preview and production environments are validated
- Rollback procedure is documented
- Production smoke verification is completed after cutover

## Recommended Delivery Order

1. Epic 1: Platform Foundation
2. Epic 2: Shared Domain and Contracts
3. Epic 3: API Rewrite
4. Epic 4: Frontend Core
5. Epic 5: Departures and Filters
6. Epic 6: Voice Search
7. Epic 7: Reliability, Observability, and Performance
8. Epic 8: Release and Cutover

## MVP Cut Line

MVP should include:

- Epic 1
- Epic 2
- Epic 3
- Epic 4
- Epic 5
- core reliability work from Epic 7
- Epic 8 release verification

Voice rewrite from Epic 6 can be delivered after MVP if the release is intentionally split.
