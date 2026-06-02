// Server-side connector abstraction. Each connector implements `fetchAndMap` with
// whatever I/O it needs (HTTP, CLI exec, etc.). Every connector satisfies this one
// interface, which keeps the three routes backend-agnostic.

import type { ConnectorMeta, MappedRelease, ValidateResult } from '../contract.js';

export interface Connector {
  /** Advertised by GET /connectors — type, label, and the config the app's form needs. */
  meta: ConnectorMeta;
  /** POST /connectors/{type}/validate — check config (and later creds) before saving. */
  validate(config: Record<string, string>): Promise<ValidateResult>;
  /** POST /releases/sync — fetch external data and map it into the app's schema. */
  fetchAndMap(config: Record<string, string>): Promise<MappedRelease>;
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
