# Source Layout

This rewrite keeps client, server, and shared code separate on purpose.

## `client/`

Owns:

- app bootstrap
- DOM rendering
- feature-local state and view modules
- browser integrations such as location and voice capture

Must not own:

- server request validation
- upstream API secrets
- cross-runtime contracts defined in `shared/`

## `server/`

Owns:

- Hono app and route registration
- request parsing and validation
- upstream service integration
- sanitization and telemetry handling

Must not own:

- DOM logic
- browser state
- client-only persistence

## `shared/`

Owns:

- domain types
- request and response contracts
- pure helpers safe for both runtimes

Must stay:

- side-effect free
- browser-agnostic
- server-agnostic

## Import Direction

- `client -> shared`
- `server -> shared`
- `client -/-> server`
- `server -/-> client`

Keep cross-boundary dependencies explicit. If a type or rule is needed in both runtimes, move it into `shared/`.
