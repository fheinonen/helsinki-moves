# Helsinki Moves

Web app for showing nearby Helsinki public transport departures using browser geolocation.

## Current status

- Transport modes: `RAIL`, `TRAM`, `METRO`, and `BUS`
- Auto-loads location on page open
- Auto-refreshes departures every 30 seconds
- Manual refresh button
- Rail filter: `Helsinki Only`
- Bus/Tram/Metro controls:
  - nearest stop selector
  - line filters
  - destination filters
- UI state is persisted in URL query params and localStorage
- Light/dark theme toggle with system preference fallback
- Theme is initialized inline in `index.html` head before CSS load to avoid flash/mismatch
- Frontend reports client errors to server-side logging endpoint

## API routes

- `GET /api/v1/departures`
  - Required: `lat`, `lon`, `mode`
  - `mode`: `RAIL`, `TRAM`, `METRO`, or `BUS`
  - BUS/TRAM/METRO optional filters: `stopId`, `line`, `dest`
  - Metro mode maps to Digitransit's upstream `SUBWAY` route mode
- `POST /api/v1/client-error`
  - Accepts sanitized client error reports (payload-limited)

## Client Metric Events

Frontend also emits lightweight sampled metric events to `POST /api/v1/client-error`
with `type: "metric"` and `context.metricName`.

- `first_successful_render`
  - `context` keys: `sessionElapsedMs`, `mode`, `requestMode`, `hasStation`, `departureCount`
- `initial_nearest_stop_resolved`
  - `context` keys: `sessionElapsedMs`, `mode`, `requestMode`, `selectedStopId`, `distanceMeters`, `departureCount`
- `first_manual_interaction`
  - `context` keys: `sessionElapsedMs`, `mode`, `interactionType` (+ optional interaction-specific keys)
- `first_manual_stop_context_change`
  - `context` keys: `sessionElapsedMs`, `mode`, `changeType`, `lineFilterCount`, `destinationFilterCount`

## CLI

The terminal CLI now lives in `cli/` and is implemented in Go.

From `cli/`:

```bash
go test ./...
go run ./cmd/hm --help

go run ./cmd/hm -l "Vihdintie 17"              # bus departures near an address
go run ./cmd/hm -l "Vihdintie 17" --line 57    # filter to line 57
go run ./cmd/hm --stop Talontie                # precise single-stop lookup
go run ./cmd/hm -l Kamppi -m tram              # tram departures
go run ./cmd/hm -l Pasila --all                # all transit modes
go run ./cmd/hm -l Pasila -m rail --json | jq '.[]'
```

Set `HM_API_URL` to override the default API endpoint (e.g. for local dev).

Standalone release archives are built from `cli/` and packaged under `cli/dist/`.

```bash
VERSION=2026.3.19 ./scripts/build-release.sh linux amd64
VERSION=2026.3.19 ./scripts/archive-release.sh linux amd64

./dist/hm_2026.3.19_linux_amd64/hm --help
tar -tzf ./dist/hm_2026.3.19_linux_amd64.tar.gz
```

Release archives follow `hm_<version>_<goos>_<goarch>.tar.gz` on Unix targets and `.zip` on Windows.

## Project structure

- `cli/cmd/hm/main.go` Go CLI entrypoint
- `cli/tests/bdd/*.scenarios.txt` CLI behavior and contract scenarios
- `web/index.html` app shell
- `web/scripts/app/*.js` frontend runtime modules (ordered via `web/scripts/app/entry.js`)
- `web/scripts/README.md` module boundaries/load order (`window.HMApp` contract)
- `web/styles/main.css` stylesheet entrypoint
- `web/styles/*.css` modular stylesheets (see `web/styles/README.md`)
- `web/tools/build-assets.mjs` asset bundling script
- `web/dist/` generated JS/CSS bundles loaded by `index.html`
- `web/assets/icons/` static icons
- `web/api/v1/departures.js` departures API
- `web/api/v1/client-error.js` client error reporting API
- `web/api/lib/digitransit.js` Digitransit GraphQL client + queries
- `web/api/lib/departures-utils.js` shared departures parsing/filter utilities
- `web/vercel.json` security headers config

## Local development

From `web/`:

1. `cp .env.example .env`
2. Set `DIGITRANSIT_API_KEY`, `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION` in `.env`
3. `npm install`
4. `npm run build`
5. Run `vercel dev`

Quick checks:

From repository root:

- `node --check web/scripts/app/01-state.js`
- `node --check web/scripts/app/02-ui.js`
- `node --check web/scripts/app/03-data.js`
- `node --check web/scripts/app/04-init.js`
- `node --check web/scripts/app/entry.js`
- `node --check web/tools/build-assets.mjs`
- `node --check web/api/v1/departures.js`
- `node --check web/api/v1/client-error.js`
- `node --check web/api/lib/digitransit.js`
- `node --check web/api/lib/departures-utils.js`

## Deploy (Vercel)

1. Import repository to Vercel.
2. Set **Root Directory** to `web`.
3. Add environment variables `DIGITRANSIT_API_KEY`, `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION`.
4. Deploy.

Runtime: Node.js `24.x` (`web/package.json`).
