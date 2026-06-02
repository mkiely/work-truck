// The connector registry: the single place that knows which backends exist. Adding a
// backend = add a line here. The routes stay backend-agnostic by going through this.

import type { Connector } from './connectors/types.js';
import { JiraConnector } from './connectors/jira/index.js';
import { AcmeConnector } from './connectors/acme/index.js';

const connectors: Connector[] = [
  JiraConnector,
  // The Acme connector is a stub (works on fixtures). It's disabled by default so it
  // doesn't surface in the app until you've filled it in. Turn it on with ENABLE_ACME=1,
  // or delete this guard to enable it permanently.
  ...(process.env.ENABLE_ACME === '1' ? [AcmeConnector] : []),
];

export const CONNECTORS: Record<string, Connector> = Object.fromEntries(
  connectors.map((c) => [c.meta.type, c]),
);

export function getConnector(type: string): Connector | undefined {
  return CONNECTORS[type];
}
