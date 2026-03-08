# Release Checklist: Greenfield Rewrite

**Status:** Drafted  
**Date:** 2026-03-08

This checklist is the cutover source of truth for the rewrite in `web/`.

## Runtime Env Vars

These env names are locked for the rewrite and should not be renamed during cutover.

### Required

- `DIGITRANSIT_API_KEY`
  Used by:
  - `web/src/server/services/digitransit/client.ts`
  - `web/src/server/services/geocode/client.ts`

### Required For Voice Parity

- `SPEECH_TRANSCRIBE_API_KEY`
  Primary speech transcription API key.
- `SPEECH_TRANSCRIBE_MODEL`
  Model name for transcription requests.

### Optional With Safe Defaults

- `SPEECH_TRANSCRIBE_API_URL`
  Defaults to the service default inside `web/src/server/services/voice/transcribe-service.ts`.
- `SPEECH_TRANSCRIBE_LANGUAGE`
  Defaults to `fi`.
- `OPENAI_API_KEY`
  Supported as a fallback only when `SPEECH_TRANSCRIBE_API_KEY` is not set.

## Env Validation

### Local `.env`

From `web/`:

1. ensure `web/.env` exists
2. ensure it contains:
   - `DIGITRANSIT_API_KEY`
   - `SPEECH_TRANSCRIBE_API_KEY`
   - `SPEECH_TRANSCRIBE_MODEL`
3. optionally override:
   - `SPEECH_TRANSCRIBE_API_URL`
   - `SPEECH_TRANSCRIBE_LANGUAGE`

### Vercel Project Env

The Vercel project must define the same production values for:

- `DIGITRANSIT_API_KEY`
- `SPEECH_TRANSCRIBE_API_KEY`
- `SPEECH_TRANSCRIBE_MODEL`
- optional `SPEECH_TRANSCRIBE_API_URL`
- optional `SPEECH_TRANSCRIBE_LANGUAGE`

## Required Validation Gates

Run from `web/`:

1. `npm run env:check`
2. `npm run check:syntax`
3. `npm run test:unit`
4. `npm run ui:perf`
5. `npm run ui:flicker`
6. `npm run perf:bundle`
7. `npm run ui:check`
8. `npx playwright test tests/e2e/voice-search.spec.ts --project=chromium`
9. `npx playwright test tests/e2e/voice-search.spec.ts --project=mobile-chromium`

Or run the full sequence with:

- `npm run release:validate`

`npm run env:check` reads `web/.env` locally and deployment env in Vercel environments.

## Preview Validation

From `web/`:

1. `npm run build`
2. `vercel dev`
3. verify:
   - departures load with real Digitransit data
   - geocode works
   - voice transcription works with real secrets
   - location refresh works
   - bus stop and filter state still sync into the URL

## Production Cutover Rules

- Cut over only after all required validation gates pass locally.
- Treat the rewrite-native performance probes as the release gates, not the legacy `.js` probes.
- Keep the legacy test files as reference material only.
- Use the deploy procedure in `docs/DEPLOY-PLAN-greenfield-rewrite.md`.
- Deploy from `web/` with:
  - `vercel --prod --yes`

## Post-Deploy Smoke Checks

After production deploy, verify:

1. app loads without console errors
2. current-location departures load successfully
3. bus mode stop selection works
4. line and destination filters work
5. voice search works through transcription and geocode
6. refresh still works after movement and temporary geolocation failure

Optional automated smoke:

- `SMOKE_BASE_URL=https://your-preview-or-prod-url npm run smoke:live`
