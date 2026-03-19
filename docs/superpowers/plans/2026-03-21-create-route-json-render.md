# Create Route Json Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/create` route that renders live departure data through a json-render React catalog without changing the existing app at `/`.

**Architecture:** Keep the current vanilla TypeScript app entry intact and add a second Vite entry for a React-only `/create` page. Build the `/create` page around a small fetch/transform layer, a json-render registry with transit-specific components, and deterministic loading and error UI.

**Tech Stack:** Vite multi-page build, React 19, json-render 0.14.1, Tailwind 4, Vitest BDD tests, Playwright e2e checks

---

### Task 1: Lock the `/create` behavior with failing tests

**Files:**
- Create: `web/tests/unit/create-departure-board-state.bdd.test.ts`
- Create: `web/tests/unit/create-route-bootstrap.bdd.test.ts`
- Create: `web/tests/e2e/create-route.spec.ts`

- [ ] **Step 1: Write the failing state-transform BDD test**
- [ ] **Step 2: Run it to verify it fails for missing `/create` code**
- [ ] **Step 3: Write the failing `/create` bootstrap BDD test**
- [ ] **Step 4: Run it to verify it fails for missing `/create` code**
- [ ] **Step 5: Write the failing `/create` browser scenario**
- [ ] **Step 6: Run it to verify the `/create` route is not implemented yet**

### Task 2: Add build and route scaffolding

**Files:**
- Create: `web/create.html`
- Modify: `web/index.html`
- Modify: `web/vite.config.ts`
- Modify: `web/tsconfig.json`
- Modify: `web/vercel.json`
- Modify: `web/package.json`

- [ ] **Step 1: Add the second HTML entry and `/create` route delivery**
- [ ] **Step 2: Add React/json-render/Tailwind dependencies**
- [ ] **Step 3: Configure Vite multi-entry build and React transform isolation**
- [ ] **Step 4: Run build-focused verification**

### Task 3: Implement the `/create` data and rendering path

**Files:**
- Create: `web/src/create/main.tsx`
- Create: `web/src/create/styles.css`
- Create: `web/src/create/default-spec.ts`
- Create: `web/src/create/departure-board-state.ts`
- Create: `web/src/create/bootstrap-create-page.tsx`
- Create: `web/src/create/registry.tsx`

- [ ] **Step 1: Implement the pure departures-to-board-state transform**
- [ ] **Step 2: Implement loading and error aware `/create` bootstrap**
- [ ] **Step 3: Implement the json-render registry and transit components**
- [ ] **Step 4: Wire the React entry to the `/api/v1/departures` endpoint**
- [ ] **Step 5: Run targeted unit and browser tests**

### Task 4: Verify the final integration

**Files:**
- Modify: `docs/REWRITE-TRACKER.md`

- [ ] **Step 1: Update tracker state if this work is part of the rewrite stream**
- [ ] **Step 2: Run `npm run test:unit` or a targeted equivalent for new coverage**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Run the `/create` browser scenario and report remaining gaps**
