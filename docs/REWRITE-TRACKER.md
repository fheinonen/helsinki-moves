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
- Intent-to-canvas create-route rewrite:
  - block-plan contracts, session state, intent-resolution boundary, route-canvas assembly, constrained block-plan rendering, Digitransit route-plan adoption, and early itinerary planning are now in progress under `web/src/client/create/`

## Next Up

- run local release validation with the current `.env`
- confirm matching Vercel project env before production cutover
- deepen itinerary planning on top of the Digitransit route-plan seam with richer degraded fallback detail and recovery actions beyond the now-landed no-route explanation, nearest-alternative guidance, and policy-aware itinerary support
- verify the live Digitransit GraphQL alerts shape before wiring alert-aware disruption handling into route canvases

## Blocked

- none

## Done

- Intent-to-canvas create-route rewrite foundation completed:
  - explicit canvas and block contracts added under `web/src/client/create/canvas-types.ts`, `block-plan-schema.ts`, and `block-plan-rules.ts`
  - dedicated intent-session state added under `web/src/client/create/intent-session.ts` with BDD coverage for draft/submit, latest-request-wins, policy changes, Home setup, parse fallback, and degraded canvas state
  - prompt parsing and destination-clarification boundary extracted into `web/src/client/create/intent-resolution.ts` and wired into `web/src/client/create/load-prompt-departures.ts`
  - shared route-canvas view-model and assembly layer added under `web/src/client/create/canvas-view-model.ts` and `route-canvas-assembler.ts` with thin Home/destination adapters
  - app-owned block-plan selection and constrained fixed-region block-plan rendering added under `web/src/client/create/block-plan-from-intent.ts` and `render-block-plan.ts`
  - the create-page shell now routes travel-style prompts through the deterministic route-canvas branch while generic board-builder prompts still use the existing generated-board path
  - draft edits in the create-route prompt now stay local while the last submitted deterministic route canvas remains visible until the next explicit submit
  - the deterministic route canvas now exposes a real policy switch and recomputes the same visible canvas in place for `fastest` vs `least_walking`
  - the create-route catalog and registry now include explicit `RouteBlock` and `SupportBlock` component types instead of relying on generic cards for the new intent-canvas spec
  - fail-first BDD coverage added for the new create-route seams:
    - `web/tests/unit/block-plan-rules.bdd.test.ts`
    - `web/tests/unit/intent-session.bdd.test.ts`
    - `web/tests/unit/intent-resolution.bdd.test.ts`
    - `web/tests/unit/route-canvas-assembler.bdd.test.ts`
    - `web/tests/unit/block-plan-from-intent.bdd.test.ts`
    - `web/tests/unit/render-block-plan.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Digitransit route-plan seam completed for route-oriented canvases:
  - `/api/v1/routes` now has contract and validation coverage under `web/tests/unit/routes-route-validation.bdd.test.ts` and `web/tests/unit/routes-route-contract.bdd.test.ts`
  - the Digitransit client now uses the verified live GraphQL `planConnection` shape instead of an assumed `plan` shape
  - browser route fetching now runs through `web/src/client/services/routes-client.ts`
  - prompt-driven create loading now returns resolved route context from `web/src/client/create/load-prompt-departures.ts`
  - the deterministic create-route canvas now prefers Digitransit route itineraries when they exist and keeps departures as supporting context/fallback
- Early itinerary-planning support landed for route-oriented canvases:
  - the route-canvas assembler now preserves transfer count and a transit-leg itinerary summary from Digitransit itineraries
  - the route block renderer now shows that itinerary summary and transfer count in the visible canvas
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/route-canvas-assembler.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Leg-aware itinerary-details block landed for route-oriented canvases:
  - validated block plans now allow a product-owned `itinerary_details` support block
  - planned route recommendations now preserve visible transit-leg detail in the canvas view model
  - the create-route renderer now shows leg-by-leg itinerary lines inside the fixed support region instead of relying only on summary text
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/render-block-plan.bdd.test.ts`
    - `web/tests/unit/route-canvas-assembler.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Timed itinerary-details support landed for route-oriented canvases:
  - itinerary legs now preserve visible time-range labels
  - primary planned recommendations now expose the interchange stop for transferred itineraries
  - the create-route support block now renders both leg timing and `Transfer at ...` messaging in the fixed support region
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/route-canvas-assembler.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Policy-aware itinerary detail landed for route-oriented canvases:
  - the visible policy switch now exposes `fewest_transfers` alongside `fastest` and `least_walking`
  - direct itineraries now keep an explicit `0 transfers` label instead of hiding transfer state
  - create-route itinerary details now recompute visibly when the user switches to `fewest_transfers`
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/route-canvas-assembler.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Honest no-route fallback landed for planned route canvases:
  - empty Digitransit itinerary results now stay on the deterministic route-canvas path instead of silently falling back to departure-ranked recommendations
  - the route explanation block now explains the no-route state and points to the nearest viable alternative stop when supporting stop data exists
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Policy-specific no-route recovery landed for route-oriented canvases:
  - when `fewest_transfers` produces no viable itinerary, the route explanation now suggests trying `fastest` instead of stopping at a dead-end message
  - the nearest viable alternative stop remains visible inside the same no-route placard state
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Digitransit alerts seam landed after live GraphQL verification:
  - verified from the live schema that root `alerts` exists as its own query and that `alerts` also attach to `Leg`, `Route`, `Stop`, `Trip`, and `Pattern`, not directly to `Itinerary`
  - added a normalized alerts contract and `/api/v1/alerts` server seam with required `route` and/or `stop` filters
  - the Digitransit client now normalizes root-alert payloads into product-owned alert entities instead of assuming common union-field shapes
  - fail-first BDD coverage added in:
    - `web/tests/unit/alerts-route-validation.bdd.test.ts`
    - `web/tests/unit/alerts-route-contract.bdd.test.ts`
    - `web/tests/unit/digitransit-alerts-client.bdd.test.ts`
- First alert-aware route canvas support landed:
  - added a browser alerts client under `web/src/client/services/alerts-client.ts`
  - planned route legs now preserve route IDs from Digitransit so the create flow can query alert context against real upstream identifiers
  - the deterministic route canvas now surfaces the first matched alert header inside the existing route explanation support block
  - fail-first BDD coverage added in:
    - `web/tests/unit/browser-alerts-client.bdd.test.ts`
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Primary-route alert prioritization landed:
  - route recommendations now preserve `routeId` in the route canvas view model
  - when both generic stop alerts and route-specific alerts are present, the support block now prefers the alert matched to the primary route instead of taking the first alert by upstream order
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Effect-aware detour copy landed for route canvases:
  - route-matched alerts with effect `DETOUR` now render product-owned support copy like `Detour on line 7` instead of echoing the raw upstream header
  - non-mapped alert effects still fall back to the upstream header for now
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Stop-moved alert copy landed for route canvases:
  - alerts with effect `STOP_MOVED` now render product-owned support copy like `Stop moved near Rautatientori` when a stop entity name is available
  - raw stop-moved headers now stay as fallback only when the upstream entity is too thin to rewrite safely
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- No-service alert copy landed for route canvases:
  - route-matched alerts with effect `NO_SERVICE` now render stronger product copy like `Line 7 not running right now`
  - raw no-service headers still remain fallback only when route identity is too thin to rewrite safely
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
- Alert-driven degraded confidence landed for severe route disruptions:
  - preferred alerts now flow through a shared route-alert helper that handles alert selection, copy mapping, and degradation rules in one place
  - `NO_SERVICE`, `SIGNIFICANT_DELAYS`, and `SEVERE` route alerts now mark the route canvas degraded
  - the degraded signal now renders through the dedicated `confidence_notice` support block instead of being appended inline to the route explanation
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/create-route-intent-canvas.bdd.test.ts`
    - `web/tests/unit/render-block-plan.bdd.test.ts`
- Direct route-alert helper coverage landed:
  - added focused BDD coverage for route-alert selection and trust rules under `web/tests/unit/route-alert-support.bdd.test.ts`
  - `stop_on_route` alerts now count as route-linked matches when choosing the preferred alert for the current primary route
  - `SIGNIFICANT_DELAYS` and `REDUCED_SERVICE` alerts now use product-owned line-specific copy instead of echoing upstream headers
  - severe `REDUCED_SERVICE` alerts now stay advisory while `SIGNIFICANT_DELAYS` continues to lower confidence
  - advisory alerts now render through a dedicated `service_note` support block while disruption alerts stay in `route_explanation` and `confidence_notice`
  - alert-driven degraded states now use a dedicated `disruption_notice` block while generic low-confidence states keep `confidence_notice`
  - no-route canvases now carry an explicit reason so policy dead-ends, service disruptions, and generic no-route states no longer share the same explanation copy
  - policy-restricted no-route states now use a dedicated `policy_recovery` support block instead of hiding the recovery path inside explanation text
  - service-disruption no-route states now use a dedicated `disruption_recovery` support block for nearest alternatives instead of mixing recovery guidance into the explanation paragraph
  - added `web/src/client/create/route-alert-render-support.ts` so alert explanation suffixes, advisory service notes, and disruption-notice visibility now come from one helper instead of being re-derived inside `registry.tsx`
  - added focused BDD coverage in `web/tests/unit/route-alert-render-support.bdd.test.ts`
- No-route support composition is now centralized:
  - added `web/src/client/create/no-route-copy.ts` and `web/src/client/create/no-route-support.ts` to keep no-route explanation and recovery copy out of `registry.tsx`
  - generic no-route canvases now keep the nearest alternative inline in the explanation while policy and disruption dead-ends keep dedicated recovery blocks
  - added fail-first BDD coverage in:
    - `web/tests/unit/no-route-copy.bdd.test.ts`
    - `web/tests/unit/no-route-support.bdd.test.ts`
- Route-canvas block selection is now derived from canvas state:
  - added `createBlockPlanForRouteCanvas(...)` so the create shell no longer hardcodes support-block combinations inline
  - degraded state, backup availability, and itinerary detail now flow into one explicit block-plan helper before rendering
  - support-block composition now also runs through `web/src/client/create/route-support-blocks.ts`, so advisory/disruption notices and no-route recovery blocks are selected from one helper instead of being re-derived inside `block-plan-from-intent.ts`
  - added focused BDD coverage in `web/tests/unit/route-support-blocks.bdd.test.ts`
  - fail-first BDD coverage expanded in:
    - `web/tests/unit/block-plan-from-intent.bdd.test.ts`
- Route-canvas fetch and recompute orchestration is now centralized:
  - added `web/src/client/create/route-canvas-state.ts` so route planning, alert lookup, and route-canvas recompute now run through one helper instead of living inline in `bootstrap-create-page.tsx`
  - `bootstrap-create-page.tsx` now stores one route-canvas data object rather than parallel responses, itineraries, alerts, and canvas state
  - added focused BDD coverage in `web/tests/unit/route-canvas-state.bdd.test.ts`
- Prompt clarification and pending-request transitions are now centralized:
  - added `web/src/client/create/prompt-flow-state.ts` so prompt request start, clarification display, typed-location continuation, typed-destination continuation, and location-denial updates now run through one helper instead of ad hoc local state mutations in `bootstrap-create-page.tsx`
  - `bootstrap-create-page.tsx` now stores one prompt-flow state object rather than separate pending request, clarification, and typed input states
  - added focused BDD coverage in `web/tests/unit/prompt-flow-state.bdd.test.ts`
- Current-location auto-resolve decisions are now centralized:
  - added `web/src/client/create/current-location-flow.ts` so “should auto-resolve?” and “how does a location result update prompt flow?” no longer live inline in `bootstrap-create-page.tsx`
  - `bootstrap-create-page.tsx` now delegates both permission/preference checks and successful/failed current-location resolution state changes through that helper
  - added focused BDD coverage in `web/tests/unit/current-location-flow.bdd.test.ts`
- Intent-session handoff is now centralized:
  - added `web/src/client/create/intent-session-flow.ts` so draft updates, prompt submit, submitted-title lookup, and clarification handoff into prompt flow no longer live inline in `bootstrap-create-page.tsx`
  - `bootstrap-create-page.tsx` now uses that helper for the remaining `intentSessionRef` touchpoints instead of directly mutating the session in multiple places
  - added focused BDD coverage in `web/tests/unit/intent-session-flow.bdd.test.ts`
- Legacy generated-board submit branching is now centralized:
  - added `web/src/client/create/legacy-generation-flow.ts` so the decision about whether Generate should drive legacy board generation or stay on the intent-canvas path no longer lives inline in the button handler
  - `bootstrap-create-page.tsx` now delegates that architecture split through one helper instead of mixing prompt classification and loader checks in-place
  - added focused BDD coverage in `web/tests/unit/legacy-generation-flow.bdd.test.ts`
- Create-page surfaces are now split into focused presentational components:
  - added `web/src/client/create/create-legacy-controls.tsx` so the prompt, API key, generate/stop actions, and generation-status copy no longer live inline in `bootstrap-create-page.tsx`
  - added `web/src/client/create/create-clarification-panels.tsx` so location and destination clarification cards no longer share a single giant JSX branch with the legacy control surface
  - `bootstrap-create-page.tsx` now reads primarily as wiring between focused helpers, presentational surfaces, and the renderer instead of hosting both product surfaces directly
- `/create` page-level coordination is now split more cleanly:
  - added `web/src/client/create/create-legacy-generation-coordinator.tsx` so API key persistence, legacy generation hook wiring, generated-spec selection, and stage overlay behavior no longer live in the page shell
  - `bootstrap-create-page.tsx` now primarily owns the intent-canvas travel session while delegating the legacy generated-board coordinator and the control-surface rendering separately
  - the remaining mixed concern in the page shell is now mostly the top-level bootstrap/load boundary rather than both product architectures sharing one large component body
- `/create` bootstrap and runtime are now separated cleanly:
  - added `web/src/client/create/create-page-runtime.tsx` so the page shell, loading/error states, and runtime coordinator no longer live in the same file as the mount/load entrypoint
  - `bootstrap-create-page.tsx` is now a thin bootstrap boundary: set page attribute, mount loading state, fetch departures, render runtime or error, and expose destroy
  - bootstrap-focused BDD coverage in `web/tests/unit/create-route-bootstrap.bdd.test.ts` continues to guard the loading/error seam while the runtime behavior stays covered by the create-route generation and intent-canvas suites

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
- Transit-board UI refinement completed:
  - rewrite shell styling now matches the compact dark transit-board direction used for the latest bus mockup
  - geometry contracts now lock the framed shell, shared control rows, and aligned three-column departures layout on desktop and mobile
  - filter controls now stay collapsed by default in the shell while interaction and light-theme stability coverage open the panel explicitly
- Cleanup pass completed:
  - transit-board responsive sizing now flows through shared shell tokens instead of repeated per-breakpoint overrides
  - departures normalization and route assembly helpers are reduced to smaller reusable functions without changing filter or ordering behavior
  - shell-side stop/filter/departure helpers are split into smaller render and sync utilities so the UI iteration code is easier to maintain
- Detached create-board prototype completed:
  - `/create` now ships as an isolated React + json-render route alongside the existing vanilla app entry
  - live departures are transformed into a json-render board state with custom `StopHeader` and `DepartureRow` components
  - multi-entry build, route-level browser coverage, and existing-shell visual regression checks now verify the new route does not regress `/`
- Detached create-board Phase 2 completed:
  - `/create` now streams Google Gemini 3.1-generated json-render specs through a shared create-route catalog and validation pipeline
  - `POST /api/v1/generate-ui` now ships with structured object streaming and stable Google API error mapping
  - the create route now persists a Google API key locally, keeps live departure state stable during spec streaming, and supports stop/recovery flows
  - focused unit coverage, mocked streaming browser coverage, typecheck, and visual regression checks now pass for the Phase 2 flow

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
