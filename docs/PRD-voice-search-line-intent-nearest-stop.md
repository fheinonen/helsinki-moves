# PRD: Voice Search Line Intent to Nearest Active Stop

**Author:** Felix Heinonen + Codex  
**Date:** 2026-03-05  
**Status:** Draft

## 1. Executive Summary

- **Problem Statement:** Voice Search currently resolves spoken input as a place query. Inputs like "Bus 67", "Tram 9", "A-train", "bussi 67", "ratikka 9", or "A-juna" are not treated as line-intent requests, so users do not reliably get the nearest stop with that line's departures.
- **Proposed Solution:** Add a voice line-intent path that detects mode + line from English/Finnish utterances, then fetches and selects the nearest stop where that line has an upcoming departure.
- **Success Criteria:**
  - At least 95% accuracy for extracting `{mode, line}` from a curated 200-utterance EN/FI test set.
  - At least 90% end-to-end success rate for returning a stop that includes the requested line in departures for supported utterances.
  - p95 time from voice capture completion to rendered results under 2.5 seconds on a warm session.
  - False-positive rate under 2% where plain location utterances are incorrectly classified as line-intent.
  - 100% pass rate for new fail-first Given/When/Then scenarios in CI.

## 2. User Experience & Functionality

- **User Personas:**
  - Daily commuter using short spoken commands in Finnish or English.
  - Tourist/occasional rider who speaks simple line phrases (for example "Tram 9").
  - Hands-busy mobile user who wants one-command nearest stop lookup by line.

- **User Stories:**
  - As a rider, I want to say "Bus 67" or "bussi 67" so I can jump directly to nearby departures for line 67.
  - As a rider, I want to say "Tram 9", "ratikka 9", "raitiovaunu 9", or "9-ratikka" so I can see nearby tram line 9 departures immediately.
  - As a rider, I want to say "A-train" or "A-juna" so I can see nearby train A departures at the nearest valid station.
  - As a rider, I want to say only a line number or token (for example "67" or "A") and still get the correct nearby line result without saying the mode.
  - As a rider, I want a clear error if no nearby stop has departures for that line right now.
  - As a rider, I want normal place-based voice search to keep working unchanged.

- **Acceptance Criteria:**
  - Voice line-intent parser recognizes:
    - English mode keywords: `bus`, `tram`, `train`.
    - Finnish mode keywords: `bussi`, `ratikka`, `raitiovaunu`, `juna`.
    - Prefix/suffix forms: `A-train`, `A juna`, `9-ratikka`, `ratikka 9`.
    - Mode-less line forms: `67`, `9`, `A`, `550B`.
  - Line token parsing supports numeric and alphanumeric lines (for example `67`, `9`, `A`, `550B`).
  - If no explicit mode keyword is present:
    - System attempts line-intent resolution using nearby stop data across supported modes.
    - If multiple modes are plausible for the same line token, nearest upcoming departure wins; ties fall back to current selected mode.
  - If line-intent is detected:
    - App switches mode to parsed mode (`bus`, `tram`, `rail`) before loading.
    - App fetches nearest stop where parsed line has an upcoming departure.
    - Rendered result shows that stop as selected stop and the line appears in departures.
    - Requested line is auto-applied to active line filters in UI and URL state.
  - If no stop within search radius has an upcoming departure for the requested line:
    - App shows status: `No nearby departures found for [mode] [line].`
    - Existing rendered results remain unchanged (no stop/mode/filter mutation).
  - If transcript does not match line-intent pattern:
    - Existing location geocode flow remains unchanged.
  - Existing voice error handling (permission denied, no speech, unsupported browser, etc.) remains unchanged.

- **Non-Goals:**
  - No generalized natural-language transit planner (for example "bus 67 to Kamppi in 10 minutes").
  - No persistent favorites or line subscriptions.
  - No changes to authentication or user accounts.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements:**
  - Browser speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`) for transcript capture.
  - Frontend deterministic intent parser for transcript normalization and `{mode, line}` extraction.
  - Existing `/api/v1/departures` backend + Digitransit GraphQL queries for stop/departure resolution.
- **Evaluation Strategy:**
  - Build a bilingual utterance benchmark (EN/FI) with at least 200 examples, including expected `{mode, line}` and negative location-only utterances.
  - Measure parser precision/recall and false-positive rate before enabling by default.
  - Add end-to-end scenarios validating that spoken line-intent yields selected stop containing requested line departures.

## 4. Technical Specifications

- **Architecture Overview:**
  - Frontend (`web/scripts/app/03-data.js`):
    - Add transcript normalization + `parseVoiceLineIntent(transcript)` helper.
    - Branch voice flow:
      - `line-intent` -> nearest-stop-by-line path.
      - `location-intent` -> current geocode path.
    - Reuse existing render/state update path after response (`load(...)`, stop-mode state sync).
  - Backend (`web/api/v1/departures.js`):
    - Add optional query signal for line-intent lookup (`line` already exists; add an explicit intent flag or equivalent internal branch).
    - When stopId is not explicitly requested and a line filter exists from line-intent:
      - Search nearby candidate stops by mode and distance.
      - Select nearest stop that has at least one upcoming departure for requested line.
      - Return that stop as `selectedStopId`.
  - Shared utilities:
    - Keep line matching on `departure.line` from `parseDeparture(...)` in `web/api/lib/departures-utils.js`.

- **Integration Points:**
  - Frontend files:
    - `web/scripts/app/03-data.js` (voice transcript path, intent branch, status messages).
    - `web/scripts/app/01-state.js` (mode/voice status updates reused; minimal adjustments as needed).
    - `web/scripts/app/02-ui.js` (user-facing status text only if new messaging helpers are needed).
  - Backend files:
    - `web/api/v1/departures.js` (stop selection algorithm for line-intent).
    - `web/api/lib/digitransit.js` (optional query helper expansion if multi-stop probing is optimized).
  - Telemetry additions:
    - `voice_line_intent_detected`
    - `voice_line_intent_resolved`
    - `voice_line_intent_no_match`
    - `voice_line_intent_parse_failed`

- **Security & Privacy:**
  - No new permission scopes beyond current microphone/location permissions.
  - No long-term storage of raw voice transcripts; keep current transient processing model.
  - Do not include raw transcripts in client error reporting payloads.

- **BDD/TDD Test Plan (Required):**
  - Add fail-first scenarios with custom BDD runner (`web/tests/helpers/bdd.js` / Playwright BDD helper).
  - Every scenario must execute production paths (no pending/skeleton steps).
  - Proposed scenarios:
    - `Scenario: Detect bus line intent in English`
      - Given speech transcript is `Bus 67`
      - When voice search is resolved
      - Then parsed mode is `bus`
      - And parsed line is `67`
    - `Scenario: Detect tram line intent in Finnish suffix form`
      - Given speech transcript is `9-ratikka`
      - When voice search is resolved
      - Then parsed mode is `tram`
      - And parsed line is `9`
    - `Scenario: Detect rail line intent with Finnish phrasing`
      - Given speech transcript is `A-juna`
      - When voice search is resolved
      - Then parsed mode is `rail`
      - And parsed line is `A`
    - `Scenario: Voice line intent chooses nearest stop with matching departure`
      - Given nearby stop A is closer but has no line `67` departures
      - And nearby stop B has line `67` departures
      - When transcript `bussi 67` is processed
      - Then selected stop is stop B
      - And returned departures include line `67`
      - And active line filters include `67`
    - `Scenario: Mode-less line utterance resolves without explicit mode keyword`
      - Given transcript is `67`
      - And nearby candidates include line `67` in multiple modes
      - When voice search is resolved
      - Then nearest upcoming valid line `67` departure determines selected mode and stop
    - `Scenario: No matching nearby line departure shows explicit status`
      - Given no nearby stop has upcoming departures for tram line `9`
      - When transcript `Tram 9` is processed
      - Then status equals `No nearby departures found for tram 9.`
      - And previously rendered results remain unchanged
    - `Scenario: Location utterance still follows geocode path`
      - Given transcript is `Kamppi Helsinki`
      - When voice search is resolved
      - Then geocode endpoint is requested
      - And line-intent path is not used

## 5. Risks & Roadmap

- **Phased Rollout:**
  - MVP:
    - Deterministic EN/FI mode+line parsing for listed utterance families.
    - Backend nearest-stop-with-line selection.
    - New status/error messaging + BDD/e2e coverage.
  - v1.1:
    - Expand synonym list and normalization rules from observed transcripts.
    - Improve ranking when multiple nearby stops contain the same line (distance + soonest departure tie-break).
  - v2.0:
    - Optional destination-conditioned line intent (`bus 67 to Kamppi`) if product scope expands.

- **Progress Update (2026-03-05):**
  - MVP: **Completed**
    - Implemented EN/FI line-intent parsing for planned utterance families.
    - Implemented backend nearest-stop-with-requested-line selection path.
    - Implemented explicit no-match status behavior and preserved existing rendered results on no-match.
    - Added fail-first BDD + e2e scenarios for parser, nearest-stop selection, no-match, and geocode fallback behavior.
  - v1.1: **Partially Completed**
    - Implemented mode-less multi-mode resolution using nearest upcoming matching departure with current-mode tie preference.
    - Not yet implemented: synonym expansion based on observed production transcripts.
    - Not yet implemented: backend tie-break optimization combining distance + soonest departure among same-line nearby stops.
  - v2.0: **Not Started**
    - Destination-conditioned line intent (`bus 67 to Kamppi`) remains out of scope for current delivery.

- **Technical Risks:**
  - Increased backend latency if checking multiple nearby stops for line availability.
  - Speech-to-text variation (for example `A train` vs `Eitreen`) may reduce parser reliability.
  - Same line number across modes can cause incorrect mode selection if utterance keyword is weak/noisy.
  - Service gaps (night/off-peak) can appear as parser failure unless no-match messaging is explicit.

## Product Decisions Captured

- MVP supports mode-less line utterances (for example `67`, `A`) without explicit mode keywords.
- When no matching nearby line departure exists, keep current rendered results unchanged and show explicit status only.
- On successful line-intent resolution, auto-apply the detected line to active line filters.
