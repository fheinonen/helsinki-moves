# Simple Vercel App: Helsinki Moves

## Structure

- `index.html` app shell
- `scripts/app.js` legacy placeholder
- `scripts/app/*.js` frontend runtime modules (loaded in order from `index.html`)
- `scripts/README.md` script module boundaries/load order (`window.HMApp` contract)
- `scripts/theme-init.js` early theme initialization (sets `data-theme` before CSS load)
- `styles/main.css` stylesheet entrypoint/import manifest
- `styles/*.css` modular stylesheets
- `styles/README.md` stylesheet maintenance guide
- `assets/icons/` app icons
- `api/v1/departures.js` departures Vercel serverless API
- `api/v1/client-error.js` client error report API
- `api/lib/digitransit.js` Digitransit GraphQL client + query helpers
- `api/lib/departures-utils.js` shared departures parsing/filtering utilities
- `vercel.json` Vercel config

## Local run

1. Install Vercel CLI:
   - `npm i -g vercel`
2. From this folder (`web/`), create local env file:
   - `cp .env.example .env`
3. Set your key in `.env`:
   - `DIGITRANSIT_API_KEY=...`
4. Run:
   - `vercel dev`

## Quick checks

From repository root:

- `node --check web/scripts/app.js`
- `node --check web/scripts/app/01-state.js`
- `node --check web/scripts/app/02-ui.js`
- `node --check web/scripts/app/03-data.js`
- `node --check web/scripts/app/04-init.js`
- `node --check web/scripts/theme-init.js`
- `node --check web/api/v1/departures.js`
- `node --check web/api/v1/client-error.js`
- `node --check web/api/lib/digitransit.js`
- `node --check web/api/lib/departures-utils.js`

## Deploy

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel dashboard, import repo.
3. Set **Root Directory** to `web`.
4. Add environment variable:
   - `DIGITRANSIT_API_KEY`
5. Deploy.

## API used

- Endpoint: `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`
- Header: `digitransit-subscription-key`

## Notes

- Frontend requests your browser location and calls `/api/v1/departures`.
- API supports multiple modes via `mode` (currently `RAIL` and `BUS`).
- Frontend also posts sanitized client errors to `/api/v1/client-error`.
- Theme supports manual light/dark toggle with system preference fallback.
