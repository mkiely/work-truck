# Adding a connector

Every connector is an **anti-corruption layer**: it translates a foreign backend into
the app's `MappedRelease` shape and satisfies one interface, so the three HTTP routes
never change. Two patterns exist today:

- **HTTP** (JIRA) — `fetchAndMap` calls a REST API (`src/lib/http.ts`).
- **CLI** (Acme) — `fetchAndMap` runs a command and parses its JSON stdout
  (`src/lib/exec.ts`). Use this pattern for any tool that exposes a CLI with JSON output.

## The interface (`src/connectors/types.ts`)

```ts
interface Connector {
  meta: ConnectorMeta;                                   // -> GET /connectors
  validate(config): Promise<{ ok; error? }>;            // -> POST /connectors/:type/validate
  fetchAndMap(config): Promise<MappedRelease>;          // -> POST /releases/sync
}
```

- `config` holds **only non-secret routing params** (which project/release/board).
  Credentials live in this service's env, keyed off the connector — **never** sent by
  the app.
- `meta.configFields` is what the app's create-form renders and collects.
- `checkRequired(meta, config)` (same file) gives you `validate` for free.

## `MappedRelease` rules (the contract)

- **Three entities only:** `workStreams`, `sprints`, `items`. Events and teams are
  local to the app — don't send them.
- **Keys are external ids.** `item.extWorkStreamId` / `item.extSprintId` are the
  *external* ids; the app resolves them to its own grid. Unknown work stream → app
  drops the item; unknown/`null` sprint → backlog. You just supply the ids.
- **Status must be exactly one of** `Not Started | Active | Blocked | Complete`.
  Always coerce; never pass a raw backend status through.
- **Dates are `YYYY-MM-DD`** strings.

## The CLI connector stub — checklist

A ready-to-fill stub exists at `src/connectors/acme/` (rename `acme` to your
connector). It compiles and runs on fixtures today. To finish it:

1. **Capture real output.** Run your CLI once and paste a representative JSON payload
   into `fixtures.ts`; adjust the `Acme*` interfaces to match its actual shape.
2. **Map it.** In `mapping.ts`, adjust the field reads and complete `coerceStatus` for
   every state your tool can emit. Keep `mapAcme` pure (no I/O).
3. **Wire the fetch.** In `index.ts` `fetchAndMap`, replace the `throw` with the real
   `runJson('<your-cli>', [..args..], { env: { TOKEN: process.env.X } })` call (see the
   commented example). No shell is used, so args are injection-safe.
4. **Set `meta`.** Pick `type` (lowercase id), `label`, and the `configFields` the app
   should collect (non-secret only).
5. **Tests.** Expand `mapping.test.ts` — assert status coercion for each state, work
   stream linkage, and a backlog (null-sprint) item.
6. **Enable it.** It's registered behind a flag in `src/registry.ts`:
   - test with fixtures: `MOCK=1 ENABLE_ACME=1 npm run dev`
   - against the real CLI: `MOCK=0 ENABLE_ACME=1 npm run dev`
   - once confident, drop the `ENABLE_ACME` guard so it's always on.

## Verify

```sh
npm run typecheck
npm test
# with the connector enabled:
ENABLE_ACME=1 npm run dev
curl localhost:8787/connectors                                  # your connector appears
curl -X POST localhost:8787/releases/sync -H 'content-type:application/json' \
  -d '{"connector":{"type":"acme","config":{"project":"PHX","release":"5.0"}}}'
```

Then trigger **Sync** in the app against a release bound to your connector.
