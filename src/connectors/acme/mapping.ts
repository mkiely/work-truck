// Pure mapping: raw Acme CLI export -> MappedRelease. No I/O, so it's trivially
// unit-testable. TODO(acme): adjust field reads + status coercion to your tool's real
// vocabulary once fixtures.ts reflects actual output.

import type { ContractStatus, MappedRelease } from '../../contract.js';
import type { AcmeExport } from './fixtures.js';

/**
 * Coerce raw status strings to the app's four canonical values. Never pass a raw status
 * through. TODO(acme): map every state your tool can emit.
 */
export function coerceStatus(state: string): ContractStatus {
  const s = state.toLowerCase();
  if (s.includes('block') || s.includes('imped')) return 'Blocked';
  if (s === 'done' || s === 'closed' || s === 'complete') return 'Complete';
  if (s === 'in_progress' || s === 'doing' || s === 'active') return 'Active';
  return 'Not Started'; // open / todo / backlog / unknown
}

/** Dates -> YYYY-MM-DD. TODO(acme): adjust if your tool emits datetimes instead. */
function toDateOnly(value: string): string {
  return value ? value.slice(0, 10) : '';
}

export function mapAcme(raw: AcmeExport): MappedRelease {
  const workStreams = raw.modules.map((m) => ({
    externalId: m.id,
    fields: { name: m.name },
  }));

  const sprints = raw.cycles.map((c) => ({
    externalId: c.id,
    fields: { name: c.name, startISO: toDateOnly(c.start), endISO: toDateOnly(c.end) },
  }));

  const items = raw.tickets.map((t) => ({
    externalId: t.id,
    extWorkStreamId: t.moduleId,
    extSprintId: t.cycleId,
    fields: {
      key: t.id,
      subject: t.title,
      description: t.body ?? '',
      status: coerceStatus(t.state),
      points: typeof t.estimate === 'number' ? t.estimate : 0,
    },
  }));

  return { workStreams, sprints, items };
}
