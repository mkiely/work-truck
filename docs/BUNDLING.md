# Bundling plan: release-tracker as a pinned dependency of work-truck

> **Status (implemented).** Phases 1–3 are done on branches
> `release-tracker@feat/env-neutral-bundle` and `work-truck@feat/release-tracker-dep`.
> Decisions taken: contract is **flattened** to top-level `sync-contract/openapi.yaml`
> in the tarball; pure-local has **no fixture fallback** (service-absent surfaces an
> error and hides connector controls); repo is **public**. Remaining to activate: push a
> `v0.2.0` tag on release-tracker so the release workflow publishes the tarball, then run
> `npm install` in work-truck to populate the lockfile (see §5).


How we turn the sibling-checkout dev topology into a **single pinned dependency**:
work-truck consumes release-tracker as **one combined GitHub Release tarball** that
bundles both the prebuilt SPA (`dist/`) and the Sync Contract (`openapi.yaml`).
Integration becomes "one `npm install`, one URL to bump on release."

This is the concrete, chosen path through `release-tracker/docs/PRODUCTION.md` §3 + §5.

---

## 0. Why this shape

work-truck needs exactly two things from release-tracker, and nothing else:

| Need | When | Today's mechanism |
|---|---|---|
| The built SPA `dist/` | runtime — to `serveStatic` on one origin | not built yet (§3 unimplemented) |
| `openapi.yaml` | build-time — `gen:contract` codegens `src/contract.generated.ts` | relative path `../release-tracker/...` (assumes siblings) |

The contract is consumed **as types only** — work-truck never imports
`@release-tracker/sync-contract` at runtime; it codegens
[`src/contract.generated.ts`](../src/contract.generated.ts) and re-exports ergonomic
aliases from [`src/contract.ts`](../src/contract.ts). So a single tarball carrying
`dist/` + `openapi.yaml` satisfies both needs, and work-truck adds **one** dependency:

```jsonc
// work-truck/package.json
"dependencies": {
  "release-tracker": "https://github.com/mkiely/release-tracker/releases/download/v0.2.0/release-tracker-0.2.0.tgz"
}
```

Dependency direction stays clean: **service → app artifacts**. The app never depends
on the service. The app stops being a thing you "run" and becomes a build-time asset
you "bundle" — which matches reality (a static SPA isn't a server).

---

## 1. ⛔ Prerequisite blocker — fix the baked URL first (release-tracker §3)

**Today's `dist/` is unshippable.** `VITE_SYNC_BASE_URL=http://localhost:8787` from
`release-tracker/.env.local` is **inlined into the bundle at build time** — confirmed:
`grep "localhost:8787" release-tracker/dist/assets/*.js` matches. A tarball of today's
`dist/` hardcodes localhost and is wrong on any other host/port. Nothing else in this
plan matters until this is fixed.

Two compounding problems in
[`createSyncClient`](../../release-tracker/src/sync/client.ts) (line ~133):

```ts
const base = import.meta.env?.VITE_SYNC_BASE_URL as string | undefined;
return base ? new HttpSyncClient(base) : new FixtureSyncClient();
```

1. The base is **baked** when set (env-specific artifact).
2. When **unset**, it falls back to `FixtureSyncClient` — so an env-neutral build would
   silently run on fixtures instead of talking to the same-origin service.

**Change (in release-tracker):**

```ts
// Default to a RELATIVE base when unset → same-origin in a bundled build,
// configurable to a cross-origin URL for dev (.env.local).
const base = (import.meta.env?.VITE_SYNC_BASE_URL as string | undefined) ?? '';
return new HttpSyncClient(base);
```

- A relative base (`''`) means `fetch('/connectors')` → same origin work-truck serves.
- Dev keeps cross-origin behavior via `.env.local` (unchanged).
- **Graceful local mode moves into `HttpSyncClient`** (PRODUCTION.md §8): add a fetch
  **timeout + fallback** so a *down/absent* service degrades to local fixtures with a
  toast, rather than `createSyncClient` choosing fixtures up front. This preserves the
  "works with no connectors" promise while making the artifact env-neutral.
  - Decision to confirm: does pure-local (no service at all) still need a fixture path?
    If yes, fold `FixtureSyncClient` in as the `HttpSyncClient` fallback target.

**Verify the fix:** after `npm run build` with no `VITE_SYNC_BASE_URL` in the
environment, `grep -r "localhost:8787" dist/` must return **nothing**.

---

## 2. release-tracker — produce the combined tarball

### 2a. Make the package packable with both artifacts

`release-tracker/package.json` today: `"private": true`, no `files` field, and `dist/`
is in `.gitignore` (so npm would exclude it unless `files` opts it back in).

```jsonc
{
  "name": "release-tracker",
  "version": "0.2.0",            // bump per release; drives the tarball filename
  "private": true,              // keep — npm pack works; blocks accidental publish
  "files": [
    "dist",                     // the prebuilt SPA (served by work-truck)
    "sync-contract/openapi.yaml" // the contract (codegen source for work-truck)
  ]
}
```

- `files` **overrides `.gitignore`** for packaging, so listing `dist` is what gets it in
  the tarball. `npm pack` then includes only these paths.
- Flatten the contract to a top-level `sync-contract/` in the tarball (vs. the repo's
  `packages/sync-contract/`) so the consumer path is short and stable. Add a copy step
  in the build, or point `files` at `packages/sync-contract/openapi.yaml` and accept the
  longer consumer path — **pick one** (see §2c note).
- Optional but recommended: also ship `sync-contract/src/generated.ts` so a consumer
  *could* skip codegen entirely (we won't, but it's cheap insurance and documents the
  contract version in the artifact).

### 2b. Build env-neutral, then pack

```sh
# CI, on a version tag — note: NO VITE_SYNC_BASE_URL in the environment
npm ci
npm run build            # → dist/ with a RELATIVE base (depends on §1)
npm pack                 # → release-tracker-0.2.0.tgz  (only `files`)
```

`npm pack` produces the *same* artifact `npm publish` would, but local — no registry.

### 2c. Release workflow (GitHub Actions on tag)

`release-tracker/.github/workflows/release.yml` (new):

```yaml
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build         # env-neutral (no VITE_SYNC_BASE_URL)
      - run: npm pack              # release-tracker-<version>.tgz
      - run: gh release create "${GITHUB_REF_NAME}" ./*.tgz
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

- Tag `vX.Y.Z` must match `package.json` `version` (add a guard step, or derive version
  from the tag). Skew here is the most common release mistake.
- This ships the **prebuilt** SPA (no build-on-install for the consumer). Do **not**
  confuse with GitHub's auto-generated `/archive/...` source tarball, which would need a
  build.
- Works for private repos too (token in the URL / `gh` auth), so a private work-truck
  fork can pull a public or private app the same way.

---

## 3. work-truck — consume the tarball

### 3a. Add the dependency

```jsonc
// work-truck/package.json → dependencies
"release-tracker": "https://github.com/mkiely/release-tracker/releases/download/v0.2.0/release-tracker-0.2.0.tgz"
```

`npm install` unpacks it to `node_modules/release-tracker/{dist,sync-contract}`.
Bumping the app = change the URL version + `npm install`. The URL is immutable per
release (no float), which is what we want for a shipped artifact.

### 3b. Repoint codegen at the dependency

[`work-truck/package.json`](../package.json) line 13 today:

```jsonc
"gen:contract": "openapi-typescript ../release-tracker/packages/sync-contract/openapi.yaml -o src/contract.generated.ts"
```

→

```jsonc
"gen:contract": "openapi-typescript node_modules/release-tracker/sync-contract/openapi.yaml -o src/contract.generated.ts"
```

This kills the **last sibling-checkout assumption**. `src/contract.generated.ts` stays
committed (codegen output is checked in), so a fresh clone typechecks without running
codegen; you only re-run `gen:contract` when bumping the app dep to a new contract
version.

### 3c. Serve the app's `dist/` (PRODUCTION.md §3, unbuilt today)

[`server.ts`](../src/server.ts) is currently routes + unconditional CORS. Add static
serving, and make CORS conditional:

```ts
import { serveStatic } from '@hono/node-server/serve-static';

// Default to the bundled dependency's dist; override with SERVE_APP for a local build.
const appDist = process.env.SERVE_APP
  ?? fileURLToPath(new URL('../node_modules/release-tracker/dist', import.meta.url));

// Same-origin prod: no CORS needed. Only enable CORS for the cross-origin dev path.
if (process.env.APP_ORIGIN || process.env.NODE_ENV !== 'production') {
  app.use('*', cors({ origin: allowOrigin }));
}

// API routes first (above), then static fallthrough for the SPA.
app.use('/assets/*', serveStatic({ root: appDist }));
app.get('*', serveStatic({ path: 'index.html', root: appDist })); // SPA history fallback
```

- Mount static **after** the contract routes so `/connectors`, `/releases/*` win.
- SPA history fallback: unknown non-API GET → `index.html` (client-side routing).
- Add `@hono/node-server/serve-static` (already in `@hono/node-server`, no new dep).
- `serveStatic`'s `root` must be **cwd-relative** (absolute unsupported), so the default
  `node_modules/release-tracker/dist` and a `SERVE_APP` override both work as-is —
  provided the service is launched from the work-truck root (`npm start` is).
- **Decided:** static is enabled when `SERVE_APP` is set **or** the default dep dist
  exists (`existsSync`). So a bundled install serves zero-config, while a pure-dev
  checkout without the dep stays API-only. CORS is enabled only when not serving, when
  `APP_ORIGIN` is set, or when `NODE_ENV !== 'production'` (the cross-origin dev path).

### 3d. One-command launcher

```jsonc
// work-truck/package.json → scripts
"start:prod": "NODE_ENV=production tsx src/index.ts"
```

`npm run start:prod` → one process, one origin (`http://localhost:8787`) serving SPA +
API. No app repo at runtime, no separate build step (the dep is prebuilt).

### 3e. Version handshake (catch a stale running service)

A pinned dep guarantees what you **built** against; it doesn't catch a stale **running**
service. Keep the runtime check (PRODUCTION.md §5):

- work-truck already has `SYNC_CONTRACT_VERSION` in [`contract.ts`](../src/contract.ts)
  (`0.13.0`). Surface it on `GET /connectors` (e.g. a header `x-sync-contract-version`
  or a wrapper field).
- The app compares it against its own `SYNC_CONTRACT_VERSION` and warns on mismatch.
- This is independent of the bundling mechanism and worth keeping regardless.

---

## 4. Sequence (strict ordering)

1. **release-tracker §1** — relative-base fix + `HttpSyncClient` timeout/fallback. Verify
   `grep localhost:8787 dist/` is empty after an env-less build. *(Hard prerequisite —
   everything downstream ships a wrong artifact without it.)*
2. **release-tracker §2** — `files`/`version`, env-neutral build, `release.yml`. Cut the
   first real tag `v0.2.0` → tarball asset on the GitHub release.
3. **work-truck §3** — add the tarball dep, repoint `gen:contract`, add `serveStatic` +
   conditional CORS + `start:prod`. `npm install`, `npm run gen:contract`, `npm run
   start:prod`, open `http://localhost:8787`.
4. **work-truck §3e** — version handshake (can land in parallel with 3).

Each step is independently verifiable; 1 gates everything; 3 depends on 2's published tag.

---

## 5. Caveats & remaining steps

- **⚠ Lockfile bootstrap** — work-truck's `package.json` pins the `v0.2.0` release URL,
  but that release does not exist yet, so `package-lock.json` has **no entry** for
  `release-tracker` and `npm ci` on a fresh clone will fail. Activation order: (1) push
  `git tag v0.2.0 && git push --tags` on release-tracker → the workflow publishes the
  tarball; (2) `npm install` in work-truck → lockfile gets the resolved URL + integrity
  hash; (3) commit the lockfile. Verified locally meanwhile by installing the
  locally-packed tarball with `npm install <tgz> --no-save`.
- **Tag/version skew** — handled: `release.yml` guards that the `v*` tag matches
  `package.json` `version` before packing. Bumping the app = retag + update the URL in
  work-truck's `package.json`.
- **Public repo** — the tarball URL is unauthenticated; `npm install` needs no token. (If
  release-tracker ever goes private, the URL needs a token or a `gh`/git credential helper
  at install time.)

### Resolved decisions
- **Contract path:** flattened to top-level `sync-contract/openapi.yaml` via the `prepack`
  staging script (§2a). work-truck codegens from `node_modules/release-tracker/sync-contract/openapi.yaml`.
- **Pure-local fallback:** no fixtures. `createSyncClient` always returns `HttpSyncClient`
  with a relative base; a down/absent service surfaces an error (store sets sync error
  state) and an empty `/connectors` hides connector controls (§1).
- **Static gating + CORS:** auto-detect dep dist / `SERVE_APP`; CORS only on the
  cross-origin dev path (§3c).

### Out of scope
- **This does NOT enable the private-connector fork (PRODUCTION.md §7)** — that's an
  orthogonal work-truck-only change (registry + `src/connectors/acme-internal/`). Bundling
  the app and adding a connector are independent axes; don't couple them.

---

## 6. Not changing

The schema, derivations, `applySync`, and the 3+2-route contract stay as-is. The app
never learns about backends; work-truck never forks the app. The boundary is intact —
this plan only changes *how the artifact is delivered*, not the contract across it.
