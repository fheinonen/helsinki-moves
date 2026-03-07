# Sprint Plan: Greenfield Rewrite

**Author:** Felix Heinonen + Codex  
**Date:** 2026-03-07  
**Status:** Draft

## Scope

This sprint plan covers the greenfield rewrite of Helsinki Moves using:

- `Vite`
- `TypeScript`
- `Hono`
- small custom client store
- `Vitest`
- `Playwright`
- Vercel-only deployment

It is based on these fixed goals:

- improve maintainability
- improve performance
- enable faster feature work
- improve reliability
- reduce bugs
- lower operational overhead

## Assumptions

- MVP rewrite first, feature parity before enhancements
- small team or one primary developer
- Vercel remains the only deployment target
- current `/api/v1/*` paths should be preserved unless explicitly changed later

## Size Scale

- `S`: 0.5 to 1.5 days
- `M`: 2 to 4 days
- `L`: 5 to 8 days

## Sprint 1: Foundation

**Goal:** get the new stack booted, testable, and deployable on Vercel.

- `T1` Create `Vite + TypeScript` frontend scaffold. `M`
- `T2` Create `Hono` API scaffold on Vercel. `M`
- `T3` Add `Vitest`, coverage config, and failure-only test scripts. `S`
- `T4` Add `Playwright` with mobile and desktop projects. `S`
- `T5` Define repo structure, path aliases, and module boundary docs. `S`
- `T6` Add CI commands for syntax, unit, coverage, and e2e. `M`

**Dependencies**

- `T3` depends on `T1` and `T2`
- `T4` depends on `T1`
- `T6` depends on `T3` and `T4`

**Sprint Exit**

- app boots locally
- API endpoint responds
- tests run in CI shape
- Vercel preview deploy is possible

## Sprint 2: Shared Contracts and Core API

**Goal:** establish typed contracts and get the first real API routes working.

- `T7` Define shared domain types for modes, stops, departures, filters, and errors. `M`
- `T8` Build query/body parsing utilities and manual validation helpers. `S`
- `T9` Build shared sanitization utilities for telemetry/error payloads. `M`
- `T10` Implement `client-error` route in Hono. `S`
- `T11` Implement `geocode` route in Hono. `M`
- `T12` Build API contract/unit tests for all completed routes. `M`

**Dependencies**

- `T8` depends on `T7`
- `T9` depends on `T7`
- `T10` depends on `T8` and `T9`
- `T11` depends on `T8`
- `T12` depends on `T10` and `T11`

**Sprint Exit**

- shared contracts exist
- telemetry route works
- geocode route works
- tests prove input/output behavior

## Sprint 3: Departures Service and Frontend Shell

**Goal:** land the main data path and render the basic shell.

- `T13` Implement Digitransit service wrapper and request builders. `M`
- `T14` Implement departures normalization, stop grouping, and filter option derivation. `L`
- `T15` Implement `/api/v1/departures` route. `M`
- `T16` Build frontend app bootstrap and custom store. `M`
- `T17` Build shell layout, theme initialization, and mode selector UI. `M`
- `T18` Add unit tests for store and departures domain logic. `M`

**Dependencies**

- `T14` depends on `T13`
- `T15` depends on `T14`
- `T16` depends on `T7`
- `T17` depends on `T16`
- `T18` depends on `T14` and `T16`

**Sprint Exit**

- mode switching works in UI
- departures endpoint works
- frontend shell is rendered from new app
- core state model exists

## Sprint 4: Location, Departures UI, and Filters

**Goal:** reach usable parity for the main product flow.

- `T19` Implement location permission, denied, unavailable, and refresh flows. `M`
- `T20` Implement departure loading orchestration with polling and request replacement. `L`
- `T21` Implement departures list rendering and timing presentation. `M`
- `T22` Implement stop selector for stop-based modes. `M`
- `T23` Implement line and destination filters plus filter summary. `M`
- `T24` Add e2e coverage for location, mode switching, and filter interactions. `M`
- `T25` Add visual regression baselines for mobile and desktop. `S`

**Dependencies**

- `T19` depends on `T16`
- `T20` depends on `T15`, `T16`, and `T19`
- `T21` depends on `T20`
- `T22` depends on `T20`
- `T23` depends on `T20`
- `T24` depends on `T19` through `T23`
- `T25` depends on `T21` through `T23`

**Sprint Exit**

- user can open app, grant location, load departures, switch mode, and filter results
- visual baselines exist
- this is the earliest plausible MVP if voice is excluded

## Sprint 5: Voice Search and Reliability Hardening

**Goal:** complete launch parity and harden failure cases.

- `T26` Implement voice capability detection and UI state. `S`
- `T27` Implement recording flow and browser cleanup paths. `L`
- `T28` Implement speech transcription proxy route. `M`
- `T29` Implement transcription result handling and ambiguity resolution. `M`
- `T30` Add retry/timeouts/race-condition hardening for API and UI flows. `M`
- `T31` Add e2e coverage for voice success/failure and upstream failure states. `M`

**Dependencies**

- `T26` depends on `T16`
- `T27` depends on `T26`
- `T28` depends on `T8`
- `T29` depends on `T27` and `T28`
- `T30` depends on `T20`, `T28`, and `T29`
- `T31` depends on `T27` through `T30`

**Sprint Exit**

- voice path is launch-ready
- failure states are controlled
- parity with the current product is close to complete

## Sprint 6: Release and Cutover

**Goal:** verify parity, control release risk, and deploy.

- `T32` Build parity checklist against current app behavior. `S`
- `T33` Fix parity gaps found in QA and e2e. `M`
- `T34` Add perf budget checks and run optimization pass. `M`
- `T35` Validate Vercel env vars, preview deploy, and production deploy plan. `S`
- `T36` Production cutover and smoke verification. `S`

**Dependencies**

- `T32` depends on `T25` and `T31`
- `T33` depends on `T32`
- `T34` depends on `T33`
- `T35` depends on `T33`
- `T36` depends on `T34` and `T35`

**Sprint Exit**

- release candidate is verified
- production rollout is complete
- rollback plan exists

## Dependency Graph

**Critical Path**

1. `T1 T2`
2. `T3 T6`
3. `T7 T8 T13 T14 T15`
4. `T16 T19 T20`
5. `T21 T22 T23`
6. `T24 T25`
7. `T26 T27 T28 T29 T30 T31`
8. `T32 T33 T34 T35 T36`

**Parallelizable Work**

- `T4` can run alongside `T3`
- `T9` can run alongside `T11`
- `T17` can run while `T13/T14` are in progress
- `T21`, `T22`, and `T23` can partly overlap once `T20` stabilizes
- `T28` can be built in parallel with `T27`
- `T34` and `T35` can overlap after parity fixes

## MVP vs Launch Parity

**MVP without voice**

- through Sprint 4
- optional subset of Sprint 6 for release readiness

**Launch parity**

- all sprints through Sprint 6

## Estimated Effort

**For one developer**

- MVP without voice: roughly `6 to 9 weeks`
- launch parity with voice: roughly `9 to 12 weeks`

**For two developers with decent parallelization**

- MVP without voice: roughly `4 to 6 weeks`
- launch parity with voice: roughly `6 to 8 weeks`

## Recommended Sequencing Decision

If risk reduction is the priority, split release in two milestones:

1. release parity app without voice rewrite
2. enable rewritten voice flow after hardening

This keeps the core commuting use case moving while isolating the highest-risk interaction path.
