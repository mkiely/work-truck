// Ergonomic aliases over the GENERATED contract types.
//
// SOURCE OF TRUTH: ../release-tracker/packages/sync-contract/openapi.yaml (app-owned,
// consumer-driven). Run `npm run gen:contract` to refresh ./contract.generated.ts
// (do not hand-edit it). This barrel mirrors the app's own re-exports
// (release-tracker/packages/sync-contract/src/index.ts) so both sides use the same
// names without reaching into `components['schemas'][...]`.

import type { components } from './contract.generated.js';

type Schemas = components['schemas'];

/** The app's four canonical work-item statuses (this service must coerce to one of these). */
export type ContractStatus = Schemas['Status'];

export type MappedWorkStream = Schemas['MappedWorkStream'];
export type MappedSprint = Schemas['MappedSprint'];
export type MappedItem = Schemas['MappedItem'];
export type MappedRelease = Schemas['MappedRelease'];

export type ConnectorConfigField = Schemas['ConnectorConfigField'];
export type ConnectorMeta = Schemas['ConnectorMeta'];
export type ValidateResult = Schemas['ValidateResult'];

export type ReleaseConnectorPayload = Schemas['ReleaseConnector'];
export type SyncRequest = Schemas['SyncRequest'];
export type ValidateRequest = Schemas['ValidateRequest'];

/** Must match `info.version` in openapi.yaml — versions the wire contract with the app. */
export const SYNC_CONTRACT_VERSION = '0.1.0';
