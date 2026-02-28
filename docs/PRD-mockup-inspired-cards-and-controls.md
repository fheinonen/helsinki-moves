# PRD: Mockup-Inspired Result Cards and Control Row

**Author:** Felix Heinonen + Codex  
**Date:** 2026-02-28  
**Status:** Draft

## 1. Executive Summary

- **Problem Statement:** The current departure cards and top action controls are functional but visually dense, slowing quick-glance reading on mobile. The current `Describe Location` wording and icon set also do not match the intended interaction model shown in the mockup.
- **Proposed Solution:** Keep the existing app architecture and overall layout, but redesign departure result cards with strong visual hierarchy inspired by the mockup, tighten the `Refresh Location` + voice-action row, rename `Describe Location` to `Voice Search`, and align relevant icons with the mockup style.
- **Success Criteria:**
  - Reduce median time-to-identify-next-departure by at least 30% versus current baseline in moderated mobile tests.
  - At least 90% of test users can correctly identify line + destination + time from the first visible card within 2 seconds.
  - 100% of relevant control labels/icons match approved mockup-inspired spec (`Refresh Location`, `Voice Search`, filter, theme icon style).
  - 100% parity for direct card-tap filtering (line, destination, stop) versus existing filter controls.
  - Zero backend API changes and zero regressions in URL/localStorage state persistence.

## 2. User Experience & Functionality

- **User Personas:**
  - Commuter glancer: checks departures while walking and needs immediate readability.
  - Daily rider: repeatedly uses refresh and voice search; expects controls to be compact and predictable.
  - Accessibility-focused user: needs clear labels, focus states, and icon+text clarity.

- **User Stories:**
  - As a rider, I want each departure card to surface line, destination, and next time in a clearer hierarchy so I can decide quickly.
  - As a rider, I want to keep filtering directly by tapping line, destination, and stop in cards so I can narrow results without opening filter controls.
  - As a rider, I want the `Refresh Location` and `Voice Search` actions to be tightly grouped and equally legible on mobile.
  - As a rider, I want the transport mode selector to match the mockup segmented look so mode switching is clearer at a glance.
  - As a rider, I want labels and icons to match their actions so I do not need to interpret ambiguous controls.

- **Acceptance Criteria:**
  - Scope boundary:
    - This is not a full UI replacement.
    - Existing information architecture and flows remain unless explicitly listed below.
  - Departure card redesign:
    - Cards use a three-zone structure inspired by the mockup:
      - Left: prominent route badge area.
      - Center: destination title with secondary stop line.
      - Right: high-priority departure timing (`Now` or clock time).
    - Route badge uses stronger color blocks and larger line numerals than today.
    - Departure timing on the right is vertically aligned and visually prioritized over metadata.
    - The first visible result (hero/top card) shows both relative and absolute time, consistent with the rest of results (for example, `Now` plus `15:52` when applicable).
    - Card spacing and typography are adjusted to reduce visual noise and improve scan speed.
    - The first visible card at the top of the list is readable without horizontal eye zig-zag.
    - Existing tap-to-filter interactions remain enabled on card elements:
      - line tap toggles line filter,
      - destination tap toggles destination filter,
      - stop tap toggles stop filter/selection according to current stop-mode behavior.
    - Card-driven filter changes continue to sync with filter summary and existing filter controls.
  - Result header refinements:
    - Keep current station title, distance, and last-updated data, but tighten spacing based on mockup rhythm.
    - Keep filter affordance, but remove the `Realtime` badge/pill from the header.
  - Controls row refinements:
    - `Refresh Location` and voice action remain as separate buttons but with tighter, balanced layout.
    - Voice button text is changed from `Describe Location` to `Voice Search`.
    - Both controls maintain clear tap targets on mobile.
  - Transit mode selector refinements:
    - Keep existing mode set (`Rail`, `Tram`, `Metro`, `Bus`) and behavior.
    - Update selector visuals to match mockup style:
      - unified rounded segmented container,
      - thin internal dividers between segments,
      - stronger filled active segment treatment,
      - consistent horizontal spacing and vertical alignment.
    - Active mode remains clearly distinguishable in both light and dark themes.
  - Icon refresh:
    - Update icons that differ from the mockup to the new visual style:
      - Refresh action icon.
      - Voice search microphone icon.
      - Filter icon treatment.
      - Theme icon styling where applicable.
    - Icon style is consistent in stroke weight, corner treatment, and visual density.
  - Accessibility:
    - Icon-only meaning is never required; text labels remain visible for primary controls.
    - Keyboard and screen-reader behavior remains intact for all modified controls.
    - Contrast remains AA-compliant in light and dark themes.

- **Non-Goals:**
  - No full-app redesign.
  - No transport-mode behavior redesign.
  - No API contract changes.
  - No feature expansion into maps, favorites, or offline support.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements:** Not applicable.
- **Evaluation Strategy:** Not applicable.

## 4. Technical Specifications

- **Architecture Overview:**
  - Keep existing vanilla JS app and Vercel deployment model.
  - Apply changes to current rendering and styles only.
  - Primary touched areas:
    - `web/index.html` (control labels/icons and structural hooks).
    - `web/scripts/app/01-state.js` (voice label behavior).
    - `web/scripts/app/02-ui.js` (card markup/class hooks if required).
    - `web/styles/departures.css`, `web/styles/controls.css`, and `web/styles/shell.css` (card/control/icon/mode-segment styling updates).

- **Integration Points:**
  - No changes to:
    - `GET /api/v1/departures`
    - `POST /api/v1/client-error`
    - URL state model
    - localStorage keys

- **Security & Privacy:**
  - No new data categories.
  - No new third-party scripts.
  - Voice search permission behavior remains browser-standard.

- **BDD/TDD Test Plan (Required):**
  - Add Given/When/Then scenarios for each new behavior with fail-first execution before implementation.
  - Ensure step definitions exercise real production code paths (no pending/no-op steps).
  - Required scenarios:
    - `Scenario: Voice action label uses Voice Search`
      - Given the app is loaded
      - When the controls row is rendered
      - Then the voice action button label is `Voice Search`
    - `Scenario: Refresh and Voice Search controls use tightened row layout`
      - Given a mobile viewport
      - When the controls row is displayed
      - Then `Refresh Location` and `Voice Search` are rendered in a compact, balanced layout without overlap
    - `Scenario: Departure cards render with badge-destination-time hierarchy`
      - Given departures are available in a stop mode
      - When departure cards are rendered
      - Then each visible card has a prominent left route badge, center destination block, and right timing block
    - `Scenario: Card timing prioritizes immediate departures`
      - Given a departure that is due now
      - When its card is rendered
      - Then the timing block shows `Now` in high-emphasis style
      - And the card also shows its absolute departure time in the same timing block
    - `Scenario: First result shows absolute time like other results`
      - Given departures are rendered
      - When the first visible result card is displayed
      - Then its timing area includes an absolute clock time just like non-first result cards
    - `Scenario: Tapping card line toggles line filter`
      - Given departures are rendered with line `52`
      - When the user taps line `52` on a departure card
      - Then line filter `52` becomes active
      - And tapping line `52` again removes that line filter
    - `Scenario: Tapping card destination toggles destination filter`
      - Given departures are rendered with destination `Otaniemi`
      - When the user taps destination `Otaniemi` on a departure card
      - Then destination filter `Otaniemi` becomes active
      - And tapping destination `Otaniemi` again removes that destination filter
    - `Scenario: Tapping card stop preserves stop-filter behavior`
      - Given departures are rendered in a stop mode
      - When the user taps a stop value on a departure card
      - Then stop filter/selection updates using current production stop-filter rules
      - And the filter summary reflects the new active filter state
    - `Scenario: Updated icons are applied to key controls`
      - Given the app shell is rendered
      - When the user views top controls and filter affordances
      - Then refresh, voice, and filter indicators use the new icon style set
    - `Scenario: Realtime badge is removed from result header`
      - Given departures are rendered
      - When the result header is displayed
      - Then no `Realtime` badge/pill is shown
    - `Scenario: Transit mode selector matches mockup segmented style`
      - Given the app shell is rendered
      - When the user views the mode selector
      - Then all transport modes are shown inside one rounded segmented control
      - And the active mode is rendered as a filled highlighted segment
      - And inactive modes are visually separated with subtle dividers
  - Keep test command output failure-only per repository standard.

## 5. Risks & Roadmap

- **Phased Rollout (Ship-When-Ready):**
  - MVP:
    - Implement card layout redesign (structure + styling).
    - Apply mockup-inspired segmented style to transit mode selector.
    - Rename `Describe Location` to `Voice Search`.
    - Tighten `Refresh Location` and voice button layout.
    - Update critical icons to new style.
  - v1.1:
    - Tune spacing/typography after real-device QA.
    - Refine edge cases (long destination names, narrow viewport wrapping).
  - v2.0:
    - Optional broader visual harmonization if this targeted refresh proves successful.

- **Technical Risks:**
  - Long destination text can break the intended card hierarchy on small screens.
  - Icon swaps can regress visual consistency across themes if not tokenized.
  - Tightened control-row spacing can reduce tap comfort if padding is over-optimized.
  - CSS updates can unintentionally affect rail and non-stop modes without regression tests.
