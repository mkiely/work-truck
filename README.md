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

## The contract (5 routes)

| Method + path | Body | Returns |
|---|---|---|
| `GET /connectors` | — | `ConnectorMeta[]` |
| `POST /connectors/:type/validate` | `{ config }` | `{ ok, error? }` |
| `POST /releases/sync` | `{ connector }` | `MappedRelease` |
| `POST /releases/push` | `{ connector, changes }` | `PushResult` |
| `POST /releases/items` | `{ connector, type, ...fields }` | `MappedItem` |

`sync` reads (backend → app); `push` and `items` write (app → backend) — push updates
writeable fields, items creates a work item and returns it mapped for reconciliation.
Only connectors that implement `push` / `createItem` accept those routes.

> **Spec note:** the OpenAPI spec describes the write routes with an id
> (`/releases/{id}/sync|push|items`), but the app's actual client calls the id-less
> forms (see `release-tracker/src/sync/client.ts`). Consumer-driven means we conform to
> what the app *sends*, so we serve the id-less routes and also serve the `/:id/` forms
> for spec-compatibility. The spec/app should be reconciled.

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
- `MOCK` — `1` (default) maps offline fixtures for live-fetch connectors; `0` uses
  the live backend. Does not affect **Acme**, which is the always-on in-process dev
  backend (no external system, no flag).

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
  server.ts               # Hono app: the 5 routes + CORS + error wrapper
  index.ts                # entrypoint (serve on PORT)
  registry.ts             # CONNECTORS map + getConnector()
  connectors/
    types.ts              # Connector interface (+ optional push/createItem) + checkRequired()
    acme/                 # the REFERENCE connector: a stateful in-process DEV backend that
                          # exercises every contract capability (sync, push incl. status +
                          # attributes, createItem, item-type catalog, status vocabulary).
                          # Build new connectors against it as the template.
      index.ts            # AcmeConnector: fetchAndMap + push + createItem
      warehouse.ts        # Acme's seeded state on top of lib/storage.ts
      fixtures.ts         # Acme's raw backend model + seed data
      itemTypes.ts        # Acme's item-type catalog + status vocabulary
      mapping.ts          # pure: raw Acme <-> contract (status coercion both ways)
      mapping.test.ts     # mapping + push + createItem unit tests
  lib/
    http.ts               # fetch + Basic-auth helper (HTTP connectors)
    exec.ts               # run a CLI + parse JSON stdout (CLI connectors)
    storage.ts            # generic localStorage-shaped store for stateful dev backends
```

## Adding a connector

1. Create `src/connectors/<name>/` with an object implementing `Connector`
   (`meta`, `validate`, `fetchAndMap`; optionally `push` / `createItem` for write-back).
   Keep mapping pure in a `mapping.ts`.
2. Register it in `src/registry.ts`.

The routes are backend-agnostic, so nothing else changes. See **CONNECTORS.md** for
the patterns (HTTP, CLI, stateful dev backend) and the `MappedRelease` rules.