# PRD: Card Results Tap-to-Filter

**Author:** Felix Heinonen + Codex  
**Date:** 2026-02-28  
**Status:** Draft

## 1. Executive Summary

- **Problem Statement:** Filtering currently requires moving from departure results to the filter panel, which adds friction during quick-glance usage. Users want to filter directly from the cards they are already reading (hero and list rows).
- **Proposed Solution:** Make line, destination, and stop values in result cards tappable so they apply filters immediately, with a prominent filter-pill flash/pulse confirmation and tap-again deselection behavior.
- **Success Criteria:**
  - 95% of card taps that map to valid filter values update visible results within 150 ms on a warm UI state.
  - 100% parity between active card-driven filters and existing filter controls (`Lines`, `Destinations`, stop selector).
  - 100% pass rate for new Given/When/Then scenarios (including fail-first probe) in CI.
  - At least one visible confirmation animation on every successful card-driven filter toggle (unless `prefers-reduced-motion` is enabled).
  - Zero backend API contract changes.

## 2. User Experience & Functionality

- **User Personas:**
  - Commuter glancer: wants one-tap narrowing from what they see in the next departure card.
  - Frequent rider: toggles between a few lines/destinations repeatedly and expects fast reversible actions.
  - Mobile one-hand user: needs large touch targets and clear visual confirmation.

- **User Stories:**
  - As a rider, I want to tap a line number in a result card so results immediately show that line.
  - As a rider, I want to tap a destination in a result card so results immediately show that destination.
  - As a rider, I want to tap the stop value shown in a result card so stop context can be narrowed without opening a separate picker first.
  - As a rider, I want to tap the same value again to remove that filter quickly.
  - As a rider, I want clear visual confirmation that filtering occurred.

- **Acceptance Criteria:**
  - Applies to result cards: `#nextSummary` (hero) and each row in `#departures`.
  - Line tap behavior:
    - If line is inactive, add it to line filters.
    - If line is active, remove it from line filters.
  - Destination tap behavior:
    - If destination is inactive, add it to destination filters.
    - If destination is active, remove it from destination filters.
  - Stop tap behavior:
    - In stop modes (`bus`, `tram`, `metro`), if tapped stop maps to an available stop option, select it.
    - If tapped stop is already selected, second tap clears explicit stop selection and falls back to nearest stop.
  - Any successful card-driven filter/stop toggle:
    - Re-renders results using existing filter logic.
    - Persists to URL/localStorage through current persistence flow.
    - Updates filter summary count text.
    - Triggers a prominent flash + pulse animation on the filter summary pill (`#stopFilterSummary`) and on the filter toggle button container.
  - If filters panel is collapsed and a card tap changes filters, panel auto-opens for 1.5 seconds minimum before user can manually close.
  - Accessibility:
    - Tappable card values are keyboard-focusable.
    - Equivalent Enter/Space actions perform the same toggle.
    - `aria-pressed` reflects active/inactive state where applicable.
  - Reduced motion:
    - Replace pulse with a non-motion highlight state when `prefers-reduced-motion: reduce`.

- **Non-Goals:**
  - No changes to Digitransit API, geocode API, or server payloads.
  - No redesign of full card layout beyond adding interactive affordances.
  - No favorites/bookmarks feature.
  - No multi-select stop model beyond existing single selected stop.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements:** Not applicable. This feature is deterministic UI/state behavior with no AI subsystem.
- **Evaluation Strategy:** Not applicable.

## 4. Technical Specifications

- **Architecture Overview:**
  - Add card interaction hooks in frontend rendering layer (`web/scripts/app/02-ui.js`) for:
    - Hero line (`#nextLine`)
    - Hero destination (`#nextDestination`)
    - Hero stop chip (`#nextTrack`, stop modes only)
    - List row line badge (`.letter-badge`)
    - List row destination (`.destination`)
    - List row stop chip (`.track`, stop modes only)
  - Reuse existing state containers:
    - `state.busLineFilters`
    - `state.busDestinationFilters`
    - `state.busStopId`
  - Reuse existing render/persist flow:
    - `api.persistUiState()`
    - `api.render(state.latestResponse)`
    - `api.setStatus(api.buildStatusFromResponse(...))`
    - `syncStopFiltersPanelUi()`

- **Integration Points:**
  - No API endpoint changes.
  - Existing telemetry extended with new interaction types:
    - `result_card_line_toggle`
    - `result_card_destination_toggle`
    - `result_card_stop_toggle`
  - Existing filter summary and panel controls remain source-of-truth UI.

- **Security & Privacy:**
  - No new data collection categories.
  - No change to permission model or security headers.

- **BDD/TDD Test Plan (Required):**
  - Add a feature test file using the custom runner in `web/tests/helpers/bdd.js`.
  - All scenarios must fail first before implementation and use real production code paths.
  - Proposed scenarios:
    - `Scenario: Tapping hero line applies line filter`
      - Given stop mode departures are rendered with line `550`
      - When the user taps line `550` in the hero card
      - Then line filter `550` is active
      - And departures are re-filtered to line `550`
    - `Scenario: Tapping active hero line removes line filter`
      - Given line filter `550` is active from a hero-card tap
      - When the user taps line `550` in the hero card again
      - Then line filter `550` is inactive
      - And departures are no longer constrained by line `550`
    - `Scenario: Tapping list destination toggles destination filter`
      - Given departures contain destination `Kamppi`
      - When the user taps destination `Kamppi` in a list row
      - Then destination filter `Kamppi` is active
      - And filter summary reflects one additional active filter
    - `Scenario: Card-driven toggle animates filter confirmation`
      - Given the stop filters panel is collapsed
      - When the user toggles a filter from a result card
      - Then the filters panel opens
      - And the filter summary pill enters flash-pulse confirmation state
    - `Scenario: Reduced-motion users receive non-animated confirmation`
      - Given reduced motion preference is enabled
      - When a result-card filter toggle succeeds
      - Then confirmation is visible without pulse animation

## 5. Risks & Roadmap

- **Phased Rollout:**
  - MVP:
    - Card tap targets for line/destination on hero and list rows.
    - Toggle-on/toggle-off logic wired to existing filters.
    - Filter summary flash/pulse confirmation.
    - BDD coverage for line/destination toggles and confirmation behavior.
  - v1.1:
    - Stop tap behavior finalization with robust nearest-stop fallback.
    - Improved visual active-state affordances directly in cards.
    - Additional accessibility refinements and keyboard hints.
  - v2.0:
    - Extend card-driven filtering parity to rail mode, if rail-specific filter model is approved.
    - Add analytics dashboard view for interaction success/error rates.

- **Technical Risks:**
  - Ambiguous stop identity from card text may not always map cleanly to selectable stop IDs.
  - Re-render timing may reset temporary animation classes unless animation trigger is centralized.
  - Auto-opening filter panel could feel jumpy if toggles happen repeatedly in rapid succession.
  - Keyboard semantics can regress if tappable values are added as plain `div` elements instead of buttons.
