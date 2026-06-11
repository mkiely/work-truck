// Service-side create validation — the contract's 422 path. The service is the
// validation authority: it re-checks the catalog's declared constraints (the app
// only best-efforts these client-side) and is the ONLY place backend-specific
// conditional/cross-field rules can live. Generic catalog checks are here;
// connector-specific rules belong in each connector (see acme/index.ts).

import type { ConnectorItemType, CreateItemRequest, FieldError } from '../contract.js';

/** Thrown by connectors on validation failure; the server maps it to a 422
 *  ValidationProblem body. */
export class ValidationError extends Error {
  readonly fieldErrors: FieldError[];
  constructor(message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

type CreateInput = Omit<CreateItemRequest, 'connector'>;

/** The submitted value for a catalog field: refs read the request's ext ids,
 *  scalars read fields[key]. */
function valueFor(f: ConnectorItemType['fields'][number], req: CreateInput): unknown {
  if (f.kind === 'ref') {
    if (f.target === 'workStream') return req.extWorkStreamId;
    if (f.target === 'sprint') return req.extSprintId;
    if (f.target === 'member') return req.extAssigneeId;
  }
  return req.fields?.[f.key];
}

/**
 * Generic catalog validation for a create request: required creatable fields
 * must be present; enum values must be one of the declared options. Returns
 * field-keyed errors (empty = valid). Connector-specific rules layer on top.
 */
export function catalogCreateErrors(type: ConnectorItemType | undefined, req: CreateInput): FieldError[] {
  if (!type) return [{ field: 'type', message: `Unknown item type ${req.type}` }];
  const errors: FieldError[] = [];
  for (const f of type.fields) {
    if (!f.creatable) continue;
    const v = valueFor(f, req);
    const label = f.label ?? f.key;
    const empty = v == null || v === '';
    if (f.required && empty) {
      errors.push({ field: f.key, message: `${label} is required` });
    } else if (!empty && f.kind === 'enum' && !f.enumRef && !(f.options ?? []).some((o) => o.value === String(v))) {
      errors.push({ field: f.key, message: `${label} must be one of: ${(f.options ?? []).map((o) => o.label).join(', ')}` });
    }
  }
  return errors;
}
