// Runs the generic contract-conformance suite against AcmeConnector. Acme exercises
// every optional capability (push, createItem, item-type catalog, status vocabulary),
// so this is the broadest run of describeConnectorContract. Connector-specific
// scenarios (status coercion, cross-field validation, etc.) live in mapping.test.ts.

import { describeConnectorContract } from '../conformance.js';
import { AcmeConnector } from './index.js';
import { resetWarehouse } from './warehouse.js';

describeConnectorContract('acme', AcmeConnector, { reset: resetWarehouse });
