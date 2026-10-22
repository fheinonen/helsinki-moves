# Helsinki Moves

Nearby Helsinki public transport departures in the browser. A fresh visit asks for your location, then shows rail, tram, metro, or bus departures. A bookmarked URL reopens the same mode, stop, line, and destination. Voice search sends captured audio for transcription and geocodes the transcript.

The running app is the TypeScript client and Hono API in `web/`. Rewrite status is in the [rewrite tracker](docs/REWRITE-TRACKER.md). The backlog is in [epics](docs/EPICS-greenfield-rewrite.md). The planned sequence is in the [sprint plan](docs/SPRINT-PLAN-greenfield-rewrite.md).

## Run it locally

From `web/`:

1. Copy the env file with `cp .env.example .env`.
2. Set `DIGITRANSIT_API_KEY` in `.env`.
3. Run `npm install`.
4. Run `npm run build`.
5. Run `vercel dev`.

`npm run dev` starts the Vite client at `http://127.0.0.1:4173` unless `HOST` or `PORT` is set. `npm run preview` serves the built client at `http://127.0.0.1:4173`. `vercel dev` serves the API routes.

Voice transcription needs `SPEECH_TRANSCRIBE_API_KEY` and `SPEECH_TRANSCRIBE_MODEL` as well. `npm run env:check` treats `DIGITRANSIT_API_KEY`, `SPEECH_TRANSCRIBE_API_KEY`, and `SPEECH_TRANSCRIBE_MODEL` as required. `.env.example` sets `SPEECH_TRANSCRIBE_API_URL` and `SPEECH_TRANSCRIBE_LANGUAGE` too. When `SPEECH_TRANSCRIBE_API_URL` is unset, the server calls `https://api.openai.com/v1/audio/transcriptions`. When `SPEECH_TRANSCRIBE_LANGUAGE` is unset, the server uses `fi`. `OPENAI_API_KEY` is a speech auth fallback when `SPEECH_TRANSCRIBE_API_KEY` is empty. `.env.example` omits `OPENAI_API_KEY`.

`web/package.json` sets the Node.js runtime to `24.x`.

## Deploy

From `web/`, run `vercel --prod --yes`.

Vercel serves the built client from `dist/` and the API entrypoints from `web/api/`. The production domain is [https://helsinkimoves.fheinonen.eu](https://helsinkimoves.fheinonen.eu).

Cutover checks are in the [release checklist](docs/RELEASE-CHECKLIST-greenfield-rewrite.md) and the [deploy plan](docs/DEPLOY-PLAN-greenfield-rewrite.md).

## App behavior

- The mode names are `RAIL`, `TRAM`, `METRO`, and `BUS`. A metro request uses Digitransit mode `SUBWAY`.
- Opening the page without a stop requests the current location and loads nearby departures.
- The page URL can bookmark `mode`, `stop`, repeated `line`, and repeated `dest`. A `stop` or `stopId` value is the location. Opening a URL with a stop restores that stop, and any line or destination in the URL, and does not request the device location. `?mode=bus&stop=...&line=550` and `?mode=bus&stop=...` behave the same way. The departures request sends the stop id. The server looks up that stop and searches nearby from its coordinates.
- A line or destination the loaded stop does not offer is removed, and the board loads again.
- The refresh control requests the device location. On success it drops the bookmarked stop and loads departures from that location. A denied or unavailable location leaves the bookmark in place.
- Changing mode does not request the device location. The selected stop's coordinates become the origin. The app clears the stop, line, and destination and loads the nearest stop for the new mode from that origin.
- The shell has a stop selector, line filters, and destination filters.
- Trips to one destination share a color, and a different destination uses a different color. The destination name stays on the row. The color stays when the board refreshes or a line or destination filter is applied.
- The colors stay distinct for protanopia. They separate by blue against yellow and by lightness, and each stays readable on the dark board. One visit uses 16 colors; a further new destination reuses an earlier color.
- Voice search posts audio to `POST /api/v1/speech-transcribe`, then geocodes the transcript.

## Run checks

Run these from `web/`. Unit and coverage scripts filter out passing Vitest lines and the summary.

- `npm run typecheck` runs `tsc --noEmit`. `npm run lint` runs that same check.
- `npm run test:unit` runs Vitest. `npm run test:coverage` adds coverage. `npm run test` runs lint and coverage.
- `npm run test:e2e` runs Playwright. `npm run test:e2e:chromium`, `npm run test:e2e:firefox`, and `npm run test:e2e:webkit` each limit the run to one browser.
- `npm run ci` runs typecheck, unit tests, coverage, and the Chromium end-to-end script.
- `npm run ui:geometry` checks layout contracts. `npm run ui:fast` runs that check and the departures interaction test.
- `npm run ui:check` compares the desktop and mobile shell snapshots. `npm run ui:baseline` updates those snapshots.
- `npm run release:validate` runs the local cutover checks, including `npm run env:check`.
- `npm run smoke:live` needs `SMOKE_BASE_URL` set to the deployed origin.

## Where the code lives

- `web/index.html` loads `web/src/client/main.ts`.
- `web/src/client/` is the browser app. Vite builds it.
- `web/src/server/` is the Hono app.
- `web/src/shared/` holds domain types and contracts. `web/tsconfig.json` enables TypeScript `strict`.
- `web/api/` holds the Vercel route entrypoints.
- Import rules are in [web/src/README.md](web/src/README.md).
- `cli/` is the Go CLI.

## API

`web/src/server/app.ts` registers the routes.

- `GET /api/health` returns `{ "ok": true }`.
- `GET /api/v1/departures` requires `mode`. It also requires `lat` and `lon`, unless `stopId` is set. A request with only `stopId` looks up that stop and searches from its coordinates. Optional keys are `stopId`, `line`, `dest`, `results`, `lineIntent`, and `intent`. `line` and `dest` are comma-separated.
- `GET /api/v1/geocode` requires `q`. Optional keys are `lat`, `lon`, and `lang`.
- `POST /api/v1/client-error` validates and sanitizes the JSON body, then returns `{ "accepted": true }` with status 202.
- `POST /api/v1/speech-transcribe` returns a transcript when speech env is set. It returns status 503 when the speech service is not configured.

## CLI

The Go CLI lives in `cli/`.

From `cli/`:

```bash
go test ./...
go run ./cmd/hm --help

go run ./cmd/hm -l "Vihdintie 17"
go run ./cmd/hm -l "Vihdintie 17" --line 57
go run ./cmd/hm --stop Talontie
go run ./cmd/hm -l Kamppi -m tram
go run ./cmd/hm -l Pasila --all
go run ./cmd/hm -l Pasila -m rail --json | jq '.[]'
```

The default API is `https://helsinkimoves.fheinonen.eu`. Set `HM_API_URL` to use another base URL.

Tagged releases publish prebuilt archives on `GitHub Releases`.

```text
hm_2026.3.19_darwin_arm64.tar.gz
hm_2026.3.19_darwin_amd64.tar.gz
hm_2026.3.19_linux_amd64.tar.gz
hm_2026.3.19_linux_arm64.tar.gz
hm_2026.3.19_windows_amd64.zip
```

The release scripts write those archives under `cli/dist/`.

```bash
VERSION=2026.3.19 ./scripts/build-release.sh linux amd64
VERSION=2026.3.19 ./scripts/archive-release.sh linux amd64

./dist/hm_2026.3.19_linux_amd64/hm --help
tar -tzf ./dist/hm_2026.3.19_linux_amd64.tar.gz
```

Unix archives use `hm_<version>_<goos>_<goarch>.tar.gz`. Windows archives use `.zip`.

## Commit

Changes in this repository are committed with `jj`.
