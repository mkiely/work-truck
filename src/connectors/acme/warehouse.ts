// Acme's stateful dev warehouse. The *mechanism* is generic (src/lib/storage.ts knows
// nothing about Acme); this module supplies Acme's data shape + seed and exposes typed
// read/write/reset over a single warehouse document.
//
// Backed by MemoryStorage today, so the warehouse re-seeds whenever the service
// restarts. Swapping in a durable KeyValueStorage (a file, a real KV) would make
// mutations persist across restarts with no change to callers.

import { MemoryStorage, namespacedStore } from '../../lib/storage.js';
import type { AcmeWarehouse } from './fixtures.js';
import { seedWarehouse } from './fixtures.js';

const WAREHOUSE_KEY = 'acme:warehouse';

const store = namespacedStore<AcmeWarehouse>(new MemoryStorage(), WAREHOUSE_KEY, seedWarehouse);

/** Current warehouse state (lazily seeded on first read). */
export function readWarehouse(): AcmeWarehouse {
  return store.read();
}

/** Persist a mutated warehouse. */
export function writeWarehouse(warehouse: AcmeWarehouse): void {
  store.write(warehouse);
}

/** Restore the warehouse to a fresh seed. Used by tests for isolation. */
export function resetWarehouse(): AcmeWarehouse {
  return store.reset();
}
