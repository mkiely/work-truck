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
Only connectors that implement `push` / `createItem` accept those routes. Write routes
reject invalid requests with **422** (`ValidationProblem`: a summary + field-keyed
errors) by throwing `ValidationError` from `src/lib/validate.ts` — the server's
error wrapper does the mapping.

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

## Implementing a new connector

Acme (`src/connectors/acme/`) is the reference — it exercises every contract
capability. To add a backend, mirror its structure:

1. **Create `src/connectors/<type>/`** with an `index.ts` exporting a
   `Connector` (see `src/connectors/types.ts`), then **register it** — one line
   in `src/registry.ts`. The routes never change.
2. **Declare `meta`** honestly — it is the app's capability handshake:
   - `configFields` — non-secret routing params the user fills in (credentials
     come from this service's env, never from the app).
   - `itemTypes` — the full field catalog, each field as data
     (`kind`/`role`/`target`, constraints, `creatable`/`writeable`). The app
     derives create forms, edit locks, push capability, and table columns from
     it; a missing `role: points` field makes the app disable capacity math for
     that backend, so don't omit what exists and don't declare what doesn't.
   - `statuses` — the native workflow vocabulary (`{id, label, category}`).
3. **`fetchAndMap(config)`** → `MappedRelease`, keyed by `externalId`
   throughout. Per item: coerce `status` to a canonical category, set
   `statusNative` from the vocabulary, resolve refs to `ext*Id`s
   (`extSprintId: null` = backlog), and pass vocabulary values through
   `filterAttributes` (`src/lib/attributes.ts`) so only catalog-declared,
   kind-coerced values reach the wire. Keep mapping pure (no I/O) in a
   `mapping.ts` — that's what makes it unit-testable.
4. **`push(config, changes)`** (optional) — apply `points`, `extSprintId`,
   `statusId` (validate against your vocabulary), and `attributes` (validate
   via `filterAttributes`). Ignore invalid values; count per-item failures in
   `PushResult`.
5. **`createItem(config, req)`** (optional) — validate with
   `catalogCreateErrors` (`src/lib/validate.ts`) plus your backend's own
   conditional rules, throwing `ValidationError` with field-keyed errors
   (→ 422); persist; return the fully-mapped `MappedItem` so the app reconciles
   it without a follow-up sync.
6. **Test like `acme/mapping.test.ts`**: pure mapping cases (status coercion,
   native states, attributes), bidirectional push round-trips, and the
   validation rejections.
7. **Run the conformance suite**: add `<type>/conformance.test.ts` calling
   `describeConnectorContract('<type>', YourConnector, { reset: ... })`
   (`src/connectors/conformance.ts`) — a backend-agnostic baseline covering meta
   shape, `fetchAndMap` invariants (canonical statuses, status vocabulary,
   attribute catalog), and push/createItem round-trips + the 422 path. Pass
   `reset` if your connector holds in-process state (see `acme/warehouse.ts`).

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
    conformance.ts        # describeConnectorContract() — generic contract conformance suite
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
      conformance.test.ts # describeConnectorContract('acme', AcmeConnector, ...)
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