# PRD: Helsinki Moves Web UI Overhaul

**Author:** Felix Heinonen + Claude
**Date:** 2026-02-26
**Status:** Draft

---

## 1. Executive Summary

### Problem Statement

Helsinki Moves' current UI suffers from two core issues: (1) **filter complexity** — stop selectors, line chips, and destination chips clutter the screen, especially on mobile, making quick glances slow; and (2) **information hierarchy** — departure data lacks clear visual priority, so users can't instantly extract the one thing they care about: "when does my next ride leave?"

### Proposed Solution

A visual and UX redesign following minimal/clean design principles (inspired by iOS Transit widgets, Citymapper). Simplify the control surface, restructure information hierarchy around a "glanceable" first impression, and modernize the visual language — all while keeping the vanilla JS stack and Vercel deployment.

### Success Criteria

| KPI | Target |
|-----|--------|
| Time-to-glance (user can read next departure) | < 1 second after data loads |
| Visible UI controls on initial load (mobile) | <= 3 (mode, location, theme) |
| Lighthouse Performance score | >= 95 |
| Lighthouse Accessibility score | 100 |
| CSS custom properties coverage | 100% of colors, spacing, and radii |

---

## 2. User Experience & Functionality

### User Personas

| Persona | Context | Need |
|---------|---------|------|
| **Commuter Clara** | Checks phone at bus stop, one hand, cold weather | Instant answer: "N minutes until my line" |
| **Explorer Erik** | Visiting Helsinki, unfamiliar with stops | Easy mode switching, clear stop names, low cognitive load |
| **Power User Pekka** | Daily user, has preferred stops/lines | Quick filters without clutter, state persistence |

### User Stories & Acceptance Criteria

#### S1: Glanceable Next Departure
> As a commuter, I want to see my next departure within 1 second of the page loading so I can decide whether to run or wait.

- **AC1:** The "Next Departure" card is the visually dominant element above the fold on mobile.
- **AC2:** Shows line, destination, minutes remaining, and track/stop in a single scannable row.
- **AC3:** Color urgency: red/amber (< 3 min), amber (3–10 min), neutral (> 10 min).

#### S2: Progressive Disclosure of Filters
> As a user, I want filters hidden by default so the screen feels clean, but accessible when I need them.

- **AC1:** On initial load, only mode toggles and the departure list are visible (no filter chips).
- **AC2:** A single "Filter" button or swipe gesture reveals line/destination filters in a collapsible panel or bottom sheet.
- **AC3:** Active filters show as a compact summary badge (e.g., "2 filters") rather than a row of chips.
- **AC4:** Stop selector (for tram/metro/bus) appears inline but compact — just the stop name as a tappable element, not a full `<select>`.

#### S3: Cleaner Departure List
> As a user, I want the departure list to feel scannable and calm, not dense and noisy.

- **AC1:** Each departure row has clear visual columns: line badge | destination | time.
- **AC2:** Track/stop info is secondary (smaller, muted text below or beside).
- **AC3:** Max 3 visual weights per row (bold line, medium destination, prominent time).
- **AC4:** Group separator or subtle divider between "imminent" and "later" departures.

#### S4: Refined Mode Switching
> As a user, I want to switch transport modes without the UI jumping or feeling jarring.

- **AC1:** Mode toggles use a segmented-control style (pill slider / iOS-style) rather than separate buttons.
- **AC2:** Mode switch triggers a smooth content transition (fade or slide), not a hard re-render flash.
- **AC3:** Active mode is clearly indicated with a filled/highlighted segment.

#### S5: Minimal Visual Chrome
> As a user, I want the app to feel like a native widget, not a web page.

- **AC1:** No visible browser-style UI patterns (outlines, system selects, default focus rings).
- **AC2:** Custom select replacement for stop picker and results limit.
- **AC3:** Consistent border-radius, spacing, and shadow tokens throughout.
- **AC4:** Typography: max 2 font weights visible at once per section.

#### S6: Improved Location Flow
> As a first-time user, I want a gentle, clear prompt for location access.

- **AC1:** Before requesting geolocation, show a brief explanation card ("We need your location to find nearby stops").
- **AC2:** If permission denied, the fallback card has a clear CTA and doesn't feel like an error.
- **AC3:** Voice/typed location button is secondary, not competing with the primary flow.

### Non-Goals (v1)

- **No framework migration.** Staying vanilla JS/CSS.
- **No map view.** Not adding map-based stop visualization.
- **No offline/PWA.** Not adding service workers or push notifications.
- **No favorites/bookmarks.** Not adding saved stops (may come in v2).
- **No new API endpoints.** Backend stays as-is; changes are purely frontend.
- **No new data sources.** Still Digitransit-only.

---

## 3. Technical Specifications

### Architecture Overview

No architectural changes — the app remains a single HTML page with vanilla ES modules bundled by esbuild, served from Vercel. Changes are confined to:

```
web/
├── index.html          ← Restructured markup (semantic, leaner)
├── styles/             ← Rewritten CSS (new design tokens, new component styles)
│   ├── tokens.css      ← Expanded: spacing scale, type scale, motion tokens
│   ├── base.css        ← Updated reset
│   ├── components/     ← NEW: one file per component (mode-switch, departure-row, etc.)
│   └── ...
├── scripts/app/
│   ├── 02-ui.js        ← Updated render functions for new markup
│   └── 04-init.js      ← Updated event wiring for new interactions
└── dist/               ← Rebuilt bundles
```

### Design Token System (Expanded)

```css
:root {
  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Type scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;

  /* Surfaces (dark) */
  --surface-0: #080c16;
  --surface-1: #0d1321;
  --surface-2: #141c2d;
  --surface-3: #1e2a3f;
}
```

### Component Breakdown

| Component | Current State | Target State |
|-----------|---------------|--------------|
| **Mode Switch** | 4 separate `<button>` elements | Segmented control with sliding indicator |
| **Next Departure** | Card with grid layout | Hero-sized, full-width, color-accent left border |
| **Departure Row** | `<li>` with inline styles for alignment | CSS Grid row with fixed columns, no JS alignment hack |
| **Stop Selector** | Native `<select>` dropdown | Custom dropdown or tappable text with popover |
| **Filter Chips** | Always-visible chip groups | Collapsible panel behind a "Filter" toggle |
| **Results Limit** | Native `<select>` | Inline stepper or compact custom select |
| **Status Line** | Plain `<p>` text | Subtle animated skeleton / shimmer during loading |

### Key Technical Changes

1. **Remove JS column alignment hack.** Replace `alignDepartureColumns()` + `requestAnimationFrame` measuring with CSS Grid fixed columns. This eliminates layout thrash and simplifies `02-ui.js`.

2. **CSS-only transitions for mode switch.** Use `transform` on a pseudo-element indicator rather than toggling classes with JS reflows.

3. **Collapsible filter panel.** Use `<details>/<summary>` or CSS `max-height` transition. Minimal JS — just toggle an `open` attribute/class.

4. **Custom select replacement.** Lightweight, accessible dropdown built with `<button>` + `role="listbox"` + `aria-expanded`. No library.

5. **Skeleton loading states.** CSS shimmer animation on placeholder elements shown while data loads, replacing the plain "Getting your location..." text.

### Integration Points

- **No changes to API contracts.** All three endpoints (`/api/v1/departures`, `/api/v1/geocode`, `/api/v1/client-error`) remain unchanged.
- **URL state persistence preserved.** Same query parameter scheme; existing shared URLs will continue to work.
- **localStorage keys unchanged.** Theme, mode, filters, limits all use the same keys.

### Security & Privacy

- No changes to CSP, HSTS, or permission headers in `vercel.json`.
- No new third-party scripts or dependencies.
- Geolocation permission flow improved UX-wise, but same browser API.

---

## 4. Risks & Roadmap

### Phased Rollout

#### Phase 1: Design Tokens & Foundation (MVP)
- Expand CSS custom properties (spacing, type, motion, surfaces)
- Restructure CSS into component files
- Update base reset and typography
- No visual changes yet — just the foundation

#### Phase 2: Component Redesign
- Segmented mode switch
- Redesigned Next Departure hero card
- CSS Grid departure rows (remove JS alignment hack)
- Skeleton loading states
- Custom stop selector dropdown

#### Phase 3: Filter UX Overhaul
- Collapsible filter panel
- Active filter summary badge
- Compact filter chip redesign
- Location permission pre-prompt card

#### Phase 4: Polish & Motion
- Transition animations for mode switching and data loading
- Micro-interactions (button press feedback, filter toggle)
- Light theme refinements
- Final responsive breakpoint tuning
- Accessibility audit (keyboard nav, screen reader testing)

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Custom select accessibility gaps | Medium | High | Follow WAI-ARIA Listbox pattern; test with VoiceOver/NVDA |
| CSS Grid departure columns break on edge cases (very long destination names) | Medium | Low | `text-overflow: ellipsis` + `min-width` constraints |
| Collapsible filters lose discoverability | Medium | Medium | Show filter toggle with badge count; auto-expand if filters are active from URL state |
| Transition animations cause jank on low-end phones | Low | Medium | Use `transform`/`opacity` only; respect `prefers-reduced-motion` |
| Regression in URL state persistence during markup restructure | Low | High | E2e tests cover URL hydration; run Playwright suite after each phase |

---

## 5. Design Reference

### Visual Principles

1. **Hierarchy through scale, not decoration.** The next departure time should be the largest element on screen. Everything else is supporting context.
2. **Breathing room.** Generous padding, especially on mobile. No element should feel cramped.
3. **Muted controls, prominent data.** Buttons and filters should visually recede; departure times and line badges should pop.
4. **Consistent rhythm.** Use the spacing scale (`--space-*`) religiously. Vertical rhythm between sections should be `--space-6` or `--space-8`.
5. **Color with purpose.** Accent colors only for urgency (amber = soon, cyan = tracking) and interactive elements. Everything else is neutral surface + text.

### Mobile Layout (320–480px)

```
┌─────────────────────────────┐
│  Helsinki Moves     12:34 🌙│  ← header: eyebrow + clock + theme
├─────────────────────────────┤
│ ┌─Rail─┬─Tram─┬Metro┬─Bus─┐│  ← segmented control
│ │██████│      │     │     ││
│ └──────┴──────┴─────┴─────┘│
├─────────────────────────────┤
│                             │
│   A    Helsinki        2min │  ← HERO: next departure (large)
│        Leppävaara    Track 4│
│                             │
├─────────────────────────────┤
│  Pasila station  ▾  [Filter]│  ← stop + filter toggle (compact)
├─────────────────────────────┤
│  P  Huopalahti       5 min  │  ← departure rows (clean grid)
│  I  Tikkurila         7 min  │
│  A  Helsinki         12 min  │
│  K  Kerava           15 min  │
│  ...                         │
└─────────────────────────────┘
```

### Color Palette (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `#080c16` | Page background |
| `--surface-1` | `#0d1321` | Card background |
| `--surface-2` | `#141c2d` | Elevated elements (buttons, inputs) |
| `--text-primary` | `#eef2f7` | Primary text |
| `--text-secondary` | `#8a9bb0` | Supporting text |
| `--text-muted` | `#4f6373` | Disabled / tertiary text |
| `--accent-amber` | `#d4a96a` | Imminent departures |
| `--accent-cyan` | `#7cb8cf` | Interactive / tracking |
| `--accent-emerald` | `#7bbf9e` | Success states |
