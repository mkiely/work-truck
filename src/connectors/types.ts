// Server-side connector abstraction. Each connector implements `fetchAndMap` with
// whatever I/O it needs (HTTP, CLI exec, etc.). Every connector satisfies this one
// interface, which keeps the three routes backend-agnostic.

import type {
  ConnectorMeta,
  CreateItemRequest,
  MappedItem,
  MappedRelease,
  PushItemChange,
  PushResult,
  ValidateResult,
} from '../contract.js';

/** Create-item request minus `connector` (the server resolves that from the route). */
export type CreateItemInput = Omit<CreateItemRequest, 'connector'>;

export interface Connector {
  /** Advertised by GET /connectors — type, label, and the config the app's form needs. */
  meta: ConnectorMeta;
  /** POST /connectors/{type}/validate — check config (and later creds) before saving. */
  validate(config: Record<string, string>): Promise<ValidateResult>;
  /** POST /releases/sync — fetch external data and map it into the app's schema. */
  fetchAndMap(config: Record<string, string>): Promise<MappedRelease>;
  /**
   * POST /releases/push — write locally-dirty writeable fields back to the backend.
   * Optional: connectors that can't write back omit it (the server reports unsupported).
   */
  push?(config: Record<string, string>, changes: PushItemChange[]): Promise<PushResult>;
  /**
   * POST /releases/items — create a work item in the backend and return it mapped, so
   * the app reconciles it as synced. Optional: only connectors that advertise a
   * creatable item type implement it.
   */
  createItem?(config: Record<string, string>, req: CreateItemInput): Promise<MappedItem>;
}

/**
 * Confirm all required config fields for a connector are filled. Mirrors the app's
 * own checkRequired (release-tracker/src/sync/client.ts) so validation semantics
 * match on both sides: missing fields are reported by their human label.
 */
export function checkRequired(meta: ConnectorMeta, config: Record<string, string>): ValidateResult {
  const missing = meta.configFields
    .filter((f) => f.required && !config[f.key]?.trim())
    .map((f) => f.label);
  return missing.length ? { ok: false, error: `Missing: ${missing.join(', ')}` } : { ok: true };
}
