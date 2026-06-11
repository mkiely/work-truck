// Ergonomic aliases over the GENERATED contract types.
//
// SOURCE OF TRUTH: ../release-tracker/packages/sync-contract/openapi.yaml (app-owned,
// consumer-driven). Run `npm run gen:contract` to refresh ./contract.generated.ts
// (do not hand-edit it). This barrel mirrors the app's own re-exports
// (release-tracker/packages/sync-contract/src/index.ts) so both sides use the same
// names without reaching into `components['schemas'][...]`.

import type { components } from './contract.generated.js';

type Schemas = components['schemas'];

/** The app's canonical work-item statuses (this service must coerce to one of these). */
export type ContractStatus = Schemas['Status'];

export type MappedWorkStream = Schemas['MappedWorkStream'];
export type MappedSprint = Schemas['MappedSprint'];
export type MappedMember = Schemas['MappedMember'];
export type MappedTeam = Schemas['MappedTeam'];
export type MappedItem = Schemas['MappedItem'];
export type MappedRelease = Schemas['MappedRelease'];

export type ConnectorConfigField = Schemas['ConnectorConfigField'];
export type FieldSpec = Schemas['FieldSpec'];
export type ConnectorItemType = Schemas['ConnectorItemType'];

/** Connector vocabulary values keyed by FieldSpec.key (non-canonical fields only). */
export type AttributeBag = Schemas['AttributeBag'];

/** One native workflow state mapped to a canonical category (see ConnectorMeta.statuses). */
export type StatusDef = Schemas['StatusDef'];
/** An item's native workflow state (denormalized id + label, mirrors itemType). */
export type StatusRef = Schemas['StatusRef'];

/** One field-level validation failure (422 ValidationProblem body). */
export type FieldError = Schemas['FieldError'];
/** Body of a 422 response from createItem/push. */
export type ValidationProblem = Schemas['ValidationProblem'];
export type ConnectorMeta = Schemas['ConnectorMeta'];
export type ValidateResult = Schemas['ValidateResult'];

export type ReleaseConnectorPayload = Schemas['ReleaseConnector'];
export type SyncRequest = Schemas['SyncRequest'];
export type ValidateRequest = Schemas['ValidateRequest'];

export type PushItemChange = Schemas['PushItemChange'];
export type PushRequest = Schemas['PushRequest'];
export type PushResult = Schemas['PushResult'];
export type CreateItemRequest = Schemas['CreateItemRequest'];

/** Must match `info.version` in openapi.yaml — versions the wire contract with the app. */
export const SYNC_CONTRACT_VERSION = '0.13.0';
