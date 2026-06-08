# Adding a connector

Every connector is an **anti-corruption layer**: it translates a foreign backend into
the consumer's contract shape and satisfies one interface, so the HTTP routes never
change. The service core (server, registry, `lib/`) stays domain-agnostic — **all domain
knowledge lives inside a connector folder.** Three patterns exist today:

- **HTTP** (JIRA) — `fetchAndMap` calls a REST API (`src/lib/http.ts`).
- **CLI** — `fetchAndMap` runs a command and parses its JSON stdout (`src/lib/exec.ts`).
  Use this for any tool that exposes a CLI with JSON output.
- **Stateful dev backend** (Acme) — a self-contained, in-process store seeded with
  fixtures that supports read *and* write. No external system; it's the reference backend
  for live-testing a consumer frontend. See `src/connectors/acme/`.

## The interface (`src/connectors/types.ts`)

```ts
interface Connector {
  meta: ConnectorMeta;                                  // -> GET /connectors
  validate(config): Promise<{ ok; error? }>;            // -> POST /connectors/:type/validate
  fetchAndMap(config): Promise<MappedRelease>;          // -> POST /releases/sync
  push?(config, changes): Promise<PushResult>;          // -> POST /releases/push   (optional)
  createItem?(config, req): Promise<MappedItem>;        // -> POST /releases/items  (optional)
}
```

- `config` holds **only non-secret routing params** (which project/release/board).
  Credentials live in this service's env, keyed off the connector — **never** sent by
  the app.
- `meta.configFields` is what the app's create-form renders and collects.
- `meta.itemTypes` is the item-type catalog (field specs with `creatable`/`writeable`
  access). The app derives the create form, push capability, and edit locks from it.
- `push` / `createItem` are **optional** — omit them on read-only connectors. The server
  returns a clean "does not support …" error when a route is called on a connector that
  doesn't implement it.
- `checkRequired(meta, config)` (same file) gives you `validate` for free.

## `MappedRelease` rules (the contract)

- **Entities:** `workStreams`, `sprints`, `items`, and an optional `team` (with
  `members`). Events stay local to the app — don't send them.
- **Keys are external ids.** `item.extWorkStreamId` / `item.extSprintId` /
  `item.extAssigneeId` are the *external* ids; the app resolves them to its own grid /
  roster. Unknown work stream → app drops the item; unknown/`null` sprint → backlog;
  unknown/`null` assignee → unassigned. You just supply the ids.
- **Status must be exactly one of** `Not Started | In Progress | Under Review | Blocked |
  Complete`. Always coerce; never pass a raw backend status through.
- **Dates are `YYYY-MM-DD`** strings.
- **`item.fields.itemType`** (`{ id, label }`) tags each item with its connector-native
  type so the app can match it to a `meta.itemTypes` entry.

## The reference dev backend (Acme)

`src/connectors/acme/` is the standard always-on DEV backend. Instead of fetching from a
real system, it owns an in-process **warehouse** (`warehouse.ts`) seeded from
`fixtures.ts`, so the consumer frontend gets genuine bidirectional behavior with nothing
external running:

- `fetchAndMap` **reads** the warehouse → `MappedRelease`.
- `push` **writes** dirty writeable fields (points, sprint) back into the warehouse.
- `createItem` **adds** a ticket and returns it mapped for reconciliation.

The warehouse is backed by `src/lib/storage.ts` — a generic, domain-agnostic
localStorage-shaped store (`MemoryStorage` + `namespacedStore<T>`). It's in-memory, so
the warehouse **re-seeds on every service restart**; swapping in a durable
`KeyValueStorage` would make mutations persist, with no change to the connector. The
storage seam knows nothing about Acme — only `warehouse.ts`/`fixtures.ts` do.

To adapt Acme into a stateful mock of a *different* backend: change the raw model + seed
in `fixtures.ts`, the item-type catalog in `itemTypes.ts`, and the translation in
`mapping.ts`; the warehouse and index wiring stay the same.

## Verify

```sh
npm run typecheck
npm test
npm run dev
curl localhost:8787/connectors                                  # your connector appears
# read:
curl -X POST localhost:8787/releases/sync -H 'content-type:application/json' \
  -d '{"connector":{"type":"acme","config":{}}}'
# write back, then re-sync to see it stick:
curl -X POST localhost:8787/releases/push -H 'content-type:application/json' \
  -d '{"connector":{"type":"acme","config":{}},"changes":[{"externalId":"ACME-102","fields":{"points":13}}]}'
# create an item, then re-sync to see it appear:
curl -X POST localhost:8787/releases/items -H 'content-type:application/json' \
  -d '{"connector":{"type":"acme","config":{}},"type":"acme_task","fields":{"subject":"Smoke test"}}'
```

Then trigger **Sync** / **Push** / **New work item** in the app against a release bound
to your connector.
