# Adding a connector

Every connector is an **anti-corruption layer**: it translates a foreign backend into
the consumer's contract shape and satisfies one interface, so the HTTP routes never
change. The service core (server, registry, `lib/`) stays domain-agnostic — **all domain
knowledge lives inside a connector folder.**

Connectors live in one of two places:

- **In-tree** (`src/connectors/<type>/`) for public, shareable backends — everything
  below applies verbatim.
- **Out-of-tree** in a private repo, for proprietary backends — same interface, same
  rules, same conformance suite; only the wiring differs. See
  [Out-of-tree (private) connectors](#out-of-tree-private-connectors) at the end.

Three patterns exist today:

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

## Out-of-tree (private) connectors

A proprietary backend's connector lives in its own (private) repo that depends on
work-truck (`"work-truck": "github:mkiely/work-truck#main"` — the lockfile pins the
commit; `npm update work-truck` absorbs upstream). Everything above still applies;
only the wiring changes:

- **Imports** come from the package instead of relative paths: the `Connector`
  interface, contract types, and the lib helpers (`getJson`, `runJson`,
  `ValidationError`, `catalogCreateErrors`, `filterAttributes`, `checkRequired`,
  `MemoryStorage`/`namespacedStore`) are all on the `work-truck` root export.
- **Registration** happens at startup instead of `src/registry.ts`:

  ```ts
  import { startServer } from 'work-truck';
  import { MyBackendConnector } from './connector.js';

  startServer({ connectors: [MyBackendConnector] });
  ```

  Built-ins (Acme) stay available alongside; a duplicate `meta.type` throws at
  startup. `createApp({ connectors })` is the same seam without the listener, for
  tests or custom serving.
- **Verify** exactly as above — the curl commands work unchanged with your `type`,
  and the service also serves the release-tracker SPA on the same origin, so the
  full app is `npm start` away. Credentials stay in the private repo's env.

### Staying compliant from a private repo

An out-of-tree connector can't lean on this repo's CI, so compliance is layered into
its own checks. Each layer catches a different class of drift:

1. **The type system is the first gate.** The installed package carries the wire
   types generated from the app-owned OpenAPI spec, so implementing `Connector` and
   typechecking already pins your shapes to the contract — `MappedRelease`,
   `FieldSpec` access rules, the canonical `Status` union, and so on. Never
   hand-declare contract shapes; import them. `SYNC_CONTRACT_VERSION` (exported from
   the root) tells you which contract revision your installed work-truck implements.

2. **The conformance suite is the behavioral gate.** Run it in the private repo's
   test suite / CI:

   ```ts
   import { describeConnectorContract } from 'work-truck/conformance';
   describeConnectorContract('my-backend', MyBackendConnector, {
     config: { /* non-secret routing params */ },
     reset: () => { /* restore backend/test-double state between cases */ },
   });
   ```

   It asserts the invariants the contract promises for *any* backend: meta
   well-formedness (unique ids, field-kind rules, facet hints, status vocabulary
   categories), `fetchAndMap` invariants (canonical statuses, ext-id referential
   integrity, declared-attributes-only, side-effect-free reads), capability honesty
   (`createItem` implemented iff a creatable field is declared), and push/createItem
   round-trips including the 422 path. Point it at a test double or a sandbox
   project, not production — the write cases create and mutate items.

3. **What the suite can't know, you test yourself.** It is deliberately blind to
   your backend's domain: status-coercion choices, cross-field validation rules,
   attribute mapping edge cases. Cover those in connector-specific tests the way
   `src/connectors/acme/mapping.test.ts` does — keep mapping pure (no I/O) so those
   tests need no backend at all.

4. **Absorbing upstream is a re-run, not a rewrite.** The lockfile pins work-truck,
   so contract drift only arrives when you choose: `npm update work-truck`, then
   typecheck + tests. A contract bump surfaces as compile errors (shape changes) or
   new conformance failures (behavioral changes) — fix those and you're current. If
   the app and service are mid-transition, pin a tag instead of `#main` until you're
   ready.

5. **Smoke against the real app last.** `npm start`, then the curl flow above and a
   real **Sync / Push / New work item** in the served SPA — the app itself is the
   consumer the contract exists for.

See the README's **Hosting a private connector** section for the minimal repo layout.
