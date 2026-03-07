# Deploy Plan: Greenfield Rewrite

**Status:** Ready for operator validation  
**Date:** 2026-03-08

This plan covers preview validation, production cutover, and rollback for the rewrite in `web/`.

## Locked Env Names

Use these env names for both local `.env` and Vercel project env:

- `DIGITRANSIT_API_KEY`
- `SPEECH_TRANSCRIBE_API_KEY`
- `SPEECH_TRANSCRIBE_MODEL`
- optional `SPEECH_TRANSCRIBE_API_URL`
- optional `SPEECH_TRANSCRIBE_LANGUAGE`
- optional `OPENAI_API_KEY` as fallback only

## Preview Plan

From `web/`:

1. ensure `web/.env` contains the locked runtime env names
2. run `npm run release:validate`
3. run `vercel dev`
4. verify:
   - departures load from live Digitransit
   - geocode resolves live locations
   - voice transcription works with real secrets
   - bus stop and filter URL state still behaves correctly
   - refresh still works after movement and temporary geolocation failure

## Production Cutover Plan

Preconditions:

- `npm run release:validate` passes locally
- preview validation with real secrets is complete
- the release checklist in `docs/RELEASE-CHECKLIST-greenfield-rewrite.md` is green

Cutover steps from `web/`:

1. confirm Vercel project env matches the locked env names
2. run `vercel --prod --yes`
3. verify the production domain manually:
   - app shell loads
   - nearby departures load
   - bus mode stop selection works
   - line and destination filters work
   - voice search works
   - refresh works

Optional automated smoke:

- from `web/`, run `SMOKE_BASE_URL=https://your-preview-or-prod-url npm run smoke:live`

## Rollback Plan

If production smoke checks fail after deploy:

1. stop using the rewrite as the active release candidate
2. redeploy the last known good Vercel production build
3. compare the failing behavior against:
   - `docs/RELEASE-CHECKLIST-greenfield-rewrite.md`
   - `docs/PARITY-CHECKLIST-greenfield-rewrite.md`
   - `tests/smoke/live-deploy-smoke.spec.ts`
4. fix the regression in the rewrite branch before the next production attempt

## Remaining Human Blocker

Engineering prep is complete for `T35`.

The remaining blocker is operational:

- matching Vercel project env must be confirmed
- local release validation must be run by the operator
