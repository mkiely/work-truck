// The connector registry: the single place that knows which backends exist. Adding a
// backend = add a line here. The routes stay backend-agnostic by going through this.

import type { Connector } from './connectors/types.js';
import { JiraConnector } from './connectors/jira/index.js';
import { AcmeConnector } from './connectors/acme/index.js';

const connectors: Connector[] = [
  JiraConnector,
  // Acme is the always-on reference DEV backend: a self-contained, stateful in-process
  // store (seeded fixtures + bidirectional push/createItem) for live-testing a consumer
  // frontend with no external system. See src/connectors/acme.
  AcmeConnector,
];

export const CONNECTORS: Record<string, Connector> = Object.fromEntries(
  connectors.map((c) => [c.meta.type, c]),
);

export function getConnector(type: string): Connector | undefined {
  return CONNECTORS[type];
}
