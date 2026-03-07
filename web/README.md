# Helsinki Moves Rewrite

This directory now hosts the greenfield rewrite of Helsinki Moves.

The rewrite targets:

- `Vite` for the client build and local dev server
- `TypeScript` in strict mode
- `Hono` for Vercel API routing
- a small custom client store instead of a UI framework
- `Vitest` for unit and contract coverage
- `Playwright` for browser and visual checks

## Architecture

### Top-level structure

- `src/client/`
  - browser bootstrap, app shell, features, styles, and client-side state
- `src/server/`
  - Hono app, routes, services, and request validation
- `src/shared/`
  - domain types, contracts, and reusable pure utilities
- `api/`
  - Vercel route entrypoints
- `tests/unit/`
  - unit and contract tests written with strict Given/When/Then scenarios
- `tests/e2e/`
  - Playwright scenarios for browser behavior

### Module boundary rules

- `src/client/` may import from `src/shared/` and client-local modules only.
- `src/server/` may import from `src/shared/` and server-local modules only.
- `src/shared/` must stay framework-free and side-effect free.
- Route handlers stay thin and delegate logic to validators and services.
- Views do not mutate global state directly; state changes flow through store actions.

## Local Development

From `web/`:

1. `cp .env.example .env`
2. Set the required runtime secrets in `.env`
3. `npm install`
4. `npm run dev`

Required runtime secrets:

- `DIGITRANSIT_API_KEY`
- `SPEECH_TRANSCRIBE_API_KEY`
- `SPEECH_TRANSCRIBE_MODEL`

Optional runtime secrets:

- `SPEECH_TRANSCRIBE_API_URL`
- `SPEECH_TRANSCRIBE_LANGUAGE`
- `OPENAI_API_KEY` as a fallback for speech auth only

Preview the production build locally:

- `npm run build`
- `npm run preview`

## Commands

- `npm run typecheck`
- `npm run test:unit`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run test:e2e:chromium`
- `npm run release:validate`
- `npm run ci`

## Testing Rules

- New behavior starts as Given/When/Then scenarios.
- Scenarios must fail before implementation.
- Step definitions must execute real production code.
- Test commands should emit failure-focused output only.

## Deploy

Deploy from `web/`:

- `vercel --prod --yes`

Vercel serves the built frontend from `dist/` and API routes from `api/`.

For cutover validation and release gates, use:

- `docs/RELEASE-CHECKLIST-greenfield-rewrite.md`
