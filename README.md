# Helsinki Moves

The next train, tram, metro, or bus, from the corner you are on.

**[helsinkimoves.fheinonen.eu](https://helsinkimoves.fheinonen.eu)**

Open it around Helsinki. The page asks where you are, then lists what is leaving nearby. Each row is a line, where it is going, and how many minutes you have. Rides that share a destination share a color, so the board is easy to scan on a dark screen.

## On your phone

Allow location the first time. The board opens on the nearest stop and shows the walk in metres.

- **Change the ride.** Rail, tram, metro, and bus are one tap apart. The place you started from stays, and the nearest stop for that mode fills in.
- **Pick another stop.** The stop menu lists places near you.
- **Shorten the list.** Filter by line, or by where the vehicle is headed.
- **Come back to this exact board.** The address remembers the mode, the stop, and any line or destination you kept. Bookmark it. Opening that link restores the board and leaves the location prompt alone.
- **See the vehicle.** Press a departure. A street map opens above the list, framed from that vehicle to your stop, and the marker keeps moving. Switch mode or pick another stop and the map closes.
- **Say a place.** The microphone takes a short recording and looks up what you said.
- **You have walked on.** Refresh reads your location again. When the phone allows it, the board follows you and the old bookmark steps aside.

## In a terminal

`hm` prints the same departures. It talks to the site above.

```bash
go run ./cmd/hm -l "Vihdintie 17"
go run ./cmd/hm -l Kamppi -m tram
```

Prebuilt binaries and the rest of the commands are in [CLI](#cli).

## Run a copy

From `web/`:

1. Copy the env file with `cp .env.example .env`.
2. Set `DIGITRANSIT_API_KEY` in `.env`. That [Digitransit](https://digitransit.fi/) key is what loads the departures, and it stays on the server.
3. Run `npm install`.
4. Run `npm run build`.
5. Run `vercel dev`.

`npm run dev` starts the Vite client at `http://127.0.0.1:4173` unless `HOST` or `PORT` is set. `npm run preview` serves the built client at `http://127.0.0.1:4173`. `vercel dev` serves the API routes.

Voice search also needs `SPEECH_TRANSCRIBE_API_KEY` and `SPEECH_TRANSCRIBE_MODEL`. `npm run env:check` treats `DIGITRANSIT_API_KEY`, `SPEECH_TRANSCRIBE_API_KEY`, and `SPEECH_TRANSCRIBE_MODEL` as required. `.env.example` sets `SPEECH_TRANSCRIBE_API_URL` and `SPEECH_TRANSCRIBE_LANGUAGE` too. When `SPEECH_TRANSCRIBE_API_URL` is unset, the server calls `https://api.openai.com/v1/audio/transcriptions`. When `SPEECH_TRANSCRIBE_LANGUAGE` is unset, the server uses `fi`. `OPENAI_API_KEY` is a speech auth fallback when `SPEECH_TRANSCRIBE_API_KEY` is empty. `.env.example` omits `OPENAI_API_KEY`.

`web/package.json` sets the Node.js runtime to `26.x`.

## Put it on the web

From `web/`, run `vercel --prod --yes`.

Vercel serves the built client from `dist/` and the API entrypoints from `web/api/`. The production domain is [https://helsinkimoves.fheinonen.eu](https://helsinkimoves.fheinonen.eu).

Cutover checks are in the [release checklist](docs/RELEASE-CHECKLIST-greenfield-rewrite.md) and the [deploy plan](docs/DEPLOY-PLAN-greenfield-rewrite.md).

## Rules the board follows

- The mode names are `RAIL`, `TRAM`, `METRO`, and `BUS`. A metro request uses Digitransit mode `SUBWAY`.
- Opening the page without a stop requests the current location and loads nearby departures.
- The page URL can bookmark `mode`, `stop`, repeated `line`, and repeated `dest`. A `stop` or `stopId` value is the location. Opening a URL with a stop restores that stop, and any line or destination in the URL, and leaves the device location alone. `?mode=bus&stop=...&line=550` and `?mode=bus&stop=...` behave the same way. The departures request sends the stop id. The server looks up that stop and searches nearby from its coordinates.
- A line or destination the loaded stop does not offer is removed, and the board loads again.
- The refresh control requests the device location. On success it drops the bookmarked stop and loads departures from that location. A denied or unavailable location leaves the bookmark in place.
- Changing mode leaves the device location alone. The app clears the stop, line, and destination, and closes an open vehicle map. After a base URL visit, the device location stays the origin. The new mode loads its nearest stop from that location. After a bookmark, the bookmarked stop stays the origin.
- Choosing another stop closes an open vehicle map.
- The shell has a stop selector, line filters, and destination filters.
- Pressing a departure opens a street map of the span from the vehicle to that stop. The frame stays put while the vehicle marker moves. The Digitransit key stays on the server. The browser asks this app for `/api/v1/vehicle-span` and `/api/v1/map-tile`.
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

The running app is the TypeScript client and Hono API in `web/`.

- `web/index.html` loads `web/src/client/main.ts`.
- `web/src/client/` is the browser app. Vite builds it.
- `web/src/server/` is the Hono app.
- `web/src/shared/` holds domain types and contracts. `web/tsconfig.json` enables TypeScript `strict`.
- `web/api/` holds the Vercel route entrypoints.
- Import rules are in [web/src/README.md](web/src/README.md).
- `cli/` is the Go CLI.

Rewrite status is in the [rewrite tracker](docs/REWRITE-TRACKER.md). The backlog is in [epics](docs/EPICS-greenfield-rewrite.md). The planned sequence is in the [sprint plan](docs/SPRINT-PLAN-greenfield-rewrite.md).

## API

`web/src/server/app.ts` registers the routes.

- `GET /api/health` returns `{ "ok": true }`.
- `GET /api/v1/departures` requires `mode`. It also requires `lat` and `lon`, unless `stopId` is set. A request with only `stopId` looks up that stop and searches from its coordinates. Optional keys are `stopId`, `line`, `dest`, `results`, `lineIntent`, and `intent`. `line` and `dest` are comma-separated.
- `GET /api/v1/geocode` requires `q`. Optional keys are `lat`, `lon`, and `lang`.
- `GET /api/v1/vehicle-span` requires `stopId` and `tripId`. It returns one event for that departure: the span from the vehicle to the stop, or the stop while the vehicle is still missing.
- `GET /api/v1/map-tile` returns one street-map tile. The browser sends `z`, `x`, and `y`.
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
