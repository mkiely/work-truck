# work-truck — Release Tracker Sync Service

Local companion process for the [Release Tracker](../release-tracker) app. The app is
an offline-first SPA that can't talk to external backends directly (browser CORS,
nowhere to hold secrets). This service owns **auth, querying, and mapping** for every
external backend and hands the app data already shaped to the app's schema.

This is a **consumer-driven contract**: the *app* owns the contract
(`packages/sync-contract/openapi.yaml` in the app repo); this service **conforms** to
it. Each connector is an anti-corruption layer that translates a foreign backend into
the app's `MappedRelease` shape. The service has no domain of its own — it's a
Backend-for-Frontend / pure translator.

## The contract (3 routes)

| Method + path | Body | Returns |
|---|---|---|
| `GET /connectors` | — | `ConnectorMeta[]` |
| `POST /connectors/:type/validate` | `{ config }` | `{ ok, error? }` |
| `POST /releases/sync` | `{ connector: { type, config } }` | `MappedRelease` |

> **Spec note:** the OpenAPI spec and the original handoff describe the sync route as
> `POST /releases/{id}/sync`, but the app's actual client calls `POST /releases/sync`
> (no id; see `release-tracker/src/sync/client.ts`). Consumer-driven means we conform
> to what the app *sends*, so we serve `/releases/sync`. We also serve
> `/releases/:id/sync` for spec-compatibility. The spec/app should be reconciled.

Wire types are generated from the app-owned OpenAPI spec — they are never hand-copied.

## Stack

Node + TypeScript (ESM), [Hono](https://hono.dev) + `@hono/node-server`, `zod`,
`tsx` (dev/run), `vitest` (tests).

## Setup

```sh
npm install
cp .env.example .env        # optional; sane defaults work for local dev
npm run gen:contract        # regenerate src/contract.generated.ts from the app's openapi.yaml
```

`gen:contract` reads `../release-tracker/packages/sync-contract/openapi.yaml` (the
sibling app repo). Re-run it whenever the app changes the contract.

## Run

```sh
npm run dev     # tsx watch, http://localhost:8787
npm start       # one-shot run
npm test        # vitest (mapping unit tests)
npm run typecheck
```

Environment (`.env`):

- `PORT` — listen port (default `8787`, matches the app's `VITE_SYNC_BASE_URL`).
- `APP_ORIGIN` — comma-separated CORS origins (default
  `http://localhost:5173,http://localhost:5180`).
- `MOCK` — `1` (default) maps offline fixtures; `0` will use a live backend (not
  implemented yet).

## Wiring the app to this service

In the app repo (`../release-tracker`), set in `.env.local`:

```
VITE_SYNC_BASE_URL=http://localhost:8787
```

That swaps the app's `FixtureSyncClient` for its `HttpSyncClient` — no other app
change needed. Start both dev servers and trigger **Sync** on a release.

## Layout

```
src/
  contract.generated.ts   # GENERATED from the app's openapi.yaml — do not edit
  contract.ts             # ergonomic aliases over the generated types
  server.ts               # Hono app: 3 routes + CORS + error wrapper
  index.ts                # entrypoint (serve on PORT)
  registry.ts             # CONNECTORS map + getConnector()
  connectors/
    types.ts              # Connector interface + checkRequired()
    jira/
      index.ts            # JiraConnector (fixture-backed today)
      mapping.ts          # pure: raw JIRA -> MappedRelease + status coercion
      fixtures.ts         # canned raw JIRA JSON (Atlas 4.0 themed)
      mapping.test.ts     # unit tests for mapJira()
  lib/
    http.ts               # fetch + Basic-auth helper (used in step 4)
```

## Adding a connector

1. Create `src/connectors/<name>/` with an object implementing `Connector`
   (`meta`, `validate`, `fetchAndMap`). Keep mapping pure in a `mapping.ts`.
2. Register it in `src/registry.ts`.

The three routes are backend-agnostic, so nothing else changes.