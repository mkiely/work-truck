// The connector registry: the single place that knows which backends exist. In-tree
// backends get a line in BUILTIN_CONNECTORS; out-of-tree (private) connectors are
// injected via createApp/startServer, which combine them with the built-ins through
// buildRegistry. The routes stay backend-agnostic by going through this.

import type { Connector } from './connectors/types.js';
import { AcmeConnector } from './connectors/acme/index.js';

// Acme is the reference connector: a self-contained, stateful in-process DEV backend
// (seeded fixtures + bidirectional push/createItem) that exercises every contract
// capability — sync, push (points/sprint/status/attributes), createItem, the
// item-type catalog, and the status vocabulary. Build new connectors against it.
const BUILTIN_CONNECTORS: Connector[] = [
  AcmeConnector,
];

/**
 * Built-ins plus injected connectors, keyed by `meta.type`. Throws on a duplicate
 * type so a bad injection fails at startup, not at request time.
 */
export function buildRegistry(extra: Connector[] = []): Record<string, Connector> {
  const registry: Record<string, Connector> = {};
  for (const c of [...BUILTIN_CONNECTORS, ...extra]) {
    if (registry[c.meta.type]) {
      throw new Error(`Duplicate connector type "${c.meta.type}" — every connector's meta.type must be unique`);
    }
    registry[c.meta.type] = c;
  }
  return registry;
}

export const CONNECTORS: Record<string, Connector> = buildRegistry();

export function getConnector(type: string): Connector | undefined {
  return CONNECTORS[type];
}
