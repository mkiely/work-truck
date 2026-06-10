// The connector registry: the single place that knows which backends exist. Adding a
// backend = add a line here. The routes stay backend-agnostic by going through this.

import type { Connector } from './connectors/types.js';
import { AcmeConnector } from './connectors/acme/index.js';

// Acme is the reference connector: a self-contained, stateful in-process DEV backend
// (seeded fixtures + bidirectional push/createItem) that exercises every contract
// capability — sync, push (points/sprint/status/attributes), createItem, the
// item-type catalog, and the status vocabulary. Build new connectors against it.
const connectors: Connector[] = [
  AcmeConnector,
];

export const CONNECTORS: Record<string, Connector> = Object.fromEntries(
  connectors.map((c) => [c.meta.type, c]),
);

export function getConnector(type: string): Connector | undefined {
  return CONNECTORS[type];
}
