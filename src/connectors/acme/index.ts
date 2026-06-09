// AcmeConnector — the reference DEV backend for live-testing a consumer frontend.
//
// Unlike a real connector (which fetches from a CLI or REST API), Acme is self-contained:
// it owns an in-process "warehouse" (warehouse.ts) seeded with fixture data. Sync reads
// the warehouse; push and createItem MUTATE it; the next sync reflects the change — so
// the frontend gets genuine bidirectional behavior with no external system. The warehouse
// re-seeds when the service restarts (in-memory).
//
// All of Acme's domain knowledge lives in this folder. The service core (server,
// registry, lib) stays contract-driven and backend-agnostic.

import type { Connector, CreateItemInput } from '../types.js';
import { checkRequired } from '../types.js';
import { filterAttributes } from '../../lib/attributes.js';
import type { ContractStatus, MappedItem, MappedRelease, PushItemChange, PushResult } from '../../contract.js';
import type { AcmeTicket } from './fixtures.js';
import { ACME_ITEM_TYPES } from './itemTypes.js';
import { mapAcme, mapTicket, toRawState } from './mapping.js';
import { readWarehouse, writeWarehouse } from './warehouse.js';

export const AcmeConnector: Connector = {
  meta: {
    type: 'acme',
    label: 'Acme (Dev)',
    // Acme needs no real routing — fields are optional so the consumer can bind a release
    // with zero setup. They're advertised so the create-release form still has something
    // to render, and to exercise the config plumbing.
    configFields: [
      { key: 'project', label: 'Project', required: false, hint: 'cosmetic for the dev backend, e.g. ACME' },
      { key: 'release', label: 'Release', required: false, hint: 'cosmetic for the dev backend, e.g. 5.0' },
    ],
    itemTypes: ACME_ITEM_TYPES,
  },

  async validate(config) {
    // No required fields, so this always passes — the point of a frictionless dev backend.
    return checkRequired(AcmeConnector.meta, config);
  },

  async fetchAndMap(_config): Promise<MappedRelease> {
    return mapAcme(readWarehouse());
  },

  async push(_config, changes: PushItemChange[]): Promise<PushResult> {
    const warehouse = readWarehouse();
    const byId = new Map(warehouse.tickets.map((t) => [t.id, t]));

    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const change of changes) {
      const ticket = byId.get(change.externalId);
      if (!ticket) {
        failed++;
        errors.push(`Unknown item ${change.externalId}`);
        continue;
      }
      // Only writeable fields per the item-type catalog: points (estimate), sprint
      // (cycle), and writeable vocabulary keys (validated through the same boundary
      // filter sync uses — undeclared keys / bad enum values are dropped).
      if (typeof change.fields.points === 'number') ticket.estimate = change.fields.points;
      if ('extSprintId' in change.fields) ticket.cycleId = change.fields.extSprintId ?? null;
      if (change.fields.attributes) {
        const type = ACME_ITEM_TYPES.find((it) => it.id === ticket.typeId);
        const valid = filterAttributes(type, change.fields.attributes) ?? {};
        if ('severity' in valid) ticket.severity = valid.severity == null ? undefined : String(valid.severity);
      }
      pushed++;
    }

    if (pushed > 0) writeWarehouse(warehouse);
    return { pushed, failed, errors };
  },

  async createItem(config, req: CreateItemInput): Promise<MappedItem> {
    const v = await this.validate(config);
    if (!v.ok) throw new Error(v.error ?? 'Invalid connector config');

    const warehouse = readWarehouse();
    const n = 900 + warehouse.seq++;
    const fields = (req.fields ?? {}) as Record<string, unknown>;
    const num = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);

    const ticket: AcmeTicket = {
      id: `ACME-${n}`,
      typeId: req.type,
      title: String(fields.subject ?? 'Untitled item'),
      body: String(fields.description ?? ''),
      state: toRawState((fields.status as ContractStatus) ?? 'Not Started'),
      estimate: num(fields.points),
      moduleId: req.extWorkStreamId ?? null,
      cycleId: req.extSprintId ?? null,
      assigneeId: req.extAssigneeId ?? null,
      // Vocabulary: store the raw value; mapTicket's boundary filter validates it
      // against the catalog on the way back out.
      ...(typeof fields.severity === 'string' && fields.severity && { severity: fields.severity }),
    };

    warehouse.tickets.push(ticket);
    writeWarehouse(warehouse);

    // Return it mapped so the consumer reconciles it as a synced item (no follow-up sync).
    return mapTicket(ticket);
  },
};

export type { AcmeWarehouse } from './fixtures.js';
