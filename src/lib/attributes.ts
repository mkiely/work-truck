// Attribute boundary filter — the service-side guarantee behind the contract's
// AttributeBag: emit ONLY catalog-declared vocabulary fields, with values coerced
// to the declared kind. Connectors hand raw backend values to filterAttributes and
// put the result on MappedItem/MappedWorkStream.attributes; the consumer can then
// trust the bag without re-validating. Backend-agnostic; lives in lib so every
// connector shares one boundary rule.

import type { AttributeBag, FieldSpec } from '../contract.js';

/** Vocabulary (attribute) field: no semantic role, not a ref, not an app-canonical
 *  enum. Mirrors the consumer's definition (release-tracker lib/connectorFields). */
export function isAttributeField(f: FieldSpec): boolean {
  return f.role == null && f.kind !== 'ref' && f.enumRef == null;
}

/** Coerce one raw value to a field's declared kind; undefined = drop the key. */
function coerce(f: FieldSpec, raw: unknown): string | number | boolean | null | undefined {
  if (raw === null) return null;
  if (raw === undefined || raw === '') return undefined;
  switch (f.kind) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : undefined;
    case 'enum': {
      const v = String(raw);
      return (f.options ?? []).some((o) => o.value === v) ? v : undefined;
    }
    default: // string / date
      return String(raw);
  }
}

/**
 * Build the AttributeBag for one entity from its declared field catalog and the
 * backend's raw field values (keyed by FieldSpec.key). Works for any catalog
 * scope: an item type's `fields` or ConnectorMeta.workStreamFields. Undeclared
 * keys and uncoercible values are dropped. Returns undefined when nothing
 * survives, so the wire stays clean.
 */
export function filterAttributes(
  fields: FieldSpec[] | undefined,
  raw: Record<string, unknown>,
): AttributeBag | undefined {
  if (!fields) return undefined;
  const bag: AttributeBag = {};
  for (const f of fields) {
    if (!isAttributeField(f) || !(f.key in raw)) continue;
    const v = coerce(f, raw[f.key]);
    if (v !== undefined) bag[f.key] = v;
  }
  return Object.keys(bag).length > 0 ? bag : undefined;
}
