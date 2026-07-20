// Public package surface (the `work-truck` root export) for out-of-tree connector
// authors. Everything here is semi-public API: a private host repo implements
// `Connector` against these types/helpers and boots via `startServer`. The
// conformance suite is deliberately NOT here — it imports vitest, so it ships on
// the separate `work-truck/conformance` subpath (see package.json `exports`).
//
// Mapping rules and patterns live in CONNECTORS.md, which ships in this package
// (node_modules/work-truck/CONNECTORS.md) — start there, especially "Canonical
// concepts vs vocabulary attributes".

export { createApp } from './server.js';
export type { CreateAppOptions } from './server.js';
export { startServer } from './serve.js';
export type { StartServerOptions } from './serve.js';
export { buildRegistry } from './registry.js';

// The connector interface and the contract's wire types (generated from the
// app-owned OpenAPI spec — consumers never run gen:contract themselves).
export { checkRequired } from './connectors/types.js';
export type { Connector, CreateItemInput } from './connectors/types.js';
export * from './contract.js';

// Building blocks connectors lean on: HTTP / CLI I-O, the 422 validation path,
// the attribute boundary filter, and the storage seam for stateful dev backends.
export { getJson } from './lib/http.js';
export type { BasicAuth } from './lib/http.js';
export { runJson } from './lib/exec.js';
export type { RunOpts } from './lib/exec.js';
export { ValidationError, catalogCreateErrors } from './lib/validate.js';
export { isAttributeField, filterAttributes } from './lib/attributes.js';
export { MemoryStorage, namespacedStore } from './lib/storage.js';
export type { KeyValueStorage, NamespacedStore } from './lib/storage.js';
