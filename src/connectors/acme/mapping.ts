// Pure mapping: Acme's raw warehouse model -> the consumer's MappedRelease contract.
// No I/O, so it's trivially unit-testable. This is the anti-corruption boundary: Acme's
// vocabulary (modules/cycles/tickets/members) on the left, the contract on the right.

import type { ContractStatus, MappedItem, MappedRelease } from '../../contract.js';
import type { AcmeTicket, AcmeWarehouse } from './fixtures.js';
import { acmeTypeLabel } from './itemTypes.js';

/**
 * Coerce a raw Acme state string to one of the contract's canonical statuses. Never pass
 * a raw status through. Order matters: blocked wins over everything.
 */
export function coerceStatus(state: string): ContractStatus {
  const s = state.toLowerCase();
  if (s.includes('block') || s.includes('imped')) return 'Blocked';
  if (s === 'done' || s === 'closed' || s === 'complete') return 'Complete';
  if (s === 'in_review' || s === 'review' || s === 'qa') return 'Under Review';
  if (s === 'in_progress' || s === 'doing' || s === 'active') return 'In Progress';
  return 'Not Started'; // todo / open / backlog / unknown
}

/**
 * Inverse of {@link coerceStatus}: pick a raw Acme state for a canonical status, so an
 * item created/pushed through the contract round-trips back to the same status on sync.
 */
export function toRawState(status: ContractStatus): string {
  switch (status) {
    case 'Complete':
      return 'done';
    case 'Blocked':
      return 'blocked';
    case 'Under Review':
      return 'in_review';
    case 'In Progress':
      return 'in_progress';
    case 'Not Started':
    default:
      return 'todo';
  }
}

/** Dates -> YYYY-MM-DD. Acme already emits date-only, but be defensive about datetimes. */
function toDateOnly(value: string): string {
  return value ? value.slice(0, 10) : '';
}

/** Map one raw ticket to a MappedItem. Shared by sync (fetchAndMap) and createItem. */
export function mapTicket(t: AcmeTicket): MappedItem {
  return {
    externalId: t.id,
    extWorkStreamId: t.moduleId,
    extSprintId: t.cycleId,
    extAssigneeId: t.assigneeId,
    fields: {
      key: t.id,
      subject: t.title,
      description: t.body ?? '',
      status: coerceStatus(t.state),
      points: typeof t.estimate === 'number' ? t.estimate : 0,
      itemType: { id: t.typeId, label: acmeTypeLabel(t.typeId) },
    },
  };
}

export function mapAcme(raw: AcmeWarehouse): MappedRelease {
  const team = {
    externalId: raw.team.id,
    fields: { name: raw.team.name },
    members: raw.members.map((m) => ({
      externalId: m.id,
      fields: m.nonContributing
        ? { name: m.name, nonContributing: true }
        : { name: m.name },
    })),
  };

  const workStreams = raw.modules.map((m) => ({
    externalId: m.id,
    fields: { name: m.name },
  }));

  const sprints = raw.cycles.map((c) => ({
    externalId: c.id,
    fields: { name: c.name, startISO: toDateOnly(c.start), endISO: toDateOnly(c.end) },
  }));

  const items = raw.tickets.map(mapTicket);

  return { team, workStreams, sprints, items };
}
