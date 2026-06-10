// Acme's RAW backend model + the seed data the dev warehouse starts from. This is the
// shape a real "Acme" backend would emit — entirely Acme's own domain vocabulary
// (modules, cycles, tickets, members). The mapper (mapping.ts) translates it into the
// consumer's contract shape; nothing here knows about that contract.
//
// Acme is the reference DEV backend: instead of fetching from a CLI or REST API, it
// holds this model in an in-process warehouse (warehouse.ts) that sync reads and
// push/createItem mutate. Restarting the service re-seeds from here.

/** A person on the Acme team. */
export interface AcmeMember {
  id: string;
  name: string;
  /** EMs/PMs etc. — surfaced as a capacity hint; the consumer owns it after creation. */
  nonContributing?: boolean;
}

/** The team that owns the work. */
export interface AcmeTeam {
  id: string;
  name: string;
  memberIds: string[];
}

/** A work stream / epic. */
export interface AcmeModule {
  id: string;
  name: string;
}

/** A sprint / iteration. */
export interface AcmeCycle {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/** A work item / ticket. */
export interface AcmeTicket {
  id: string;
  /** Acme-native item type id; references an entry in the item-type catalog (itemTypes.ts). */
  typeId: string;
  title: string;
  body: string;
  state: string; // raw status string — coerced to a canonical value in mapping.ts
  estimate: number; // story points
  moduleId: string | null; // -> extWorkStreamId
  cycleId: string | null; // -> extSprintId (null = backlog)
  assigneeId: string | null; // -> extAssigneeId
  /** Bug severity — vocabulary, not canonical; surfaces via attributes (catalog: acme_bug.severity). */
  severity?: string;
}

/** The entire Acme backend, as one document. This is what the warehouse persists. */
export interface AcmeWarehouse {
  team: AcmeTeam;
  members: AcmeMember[];
  modules: AcmeModule[];
  cycles: AcmeCycle[];
  tickets: AcmeTicket[];
  /** Monotonic counter for allocating new ticket ids/keys on createItem. */
  seq: number;
}

/** A fresh copy of the seed warehouse. A factory so each call is independent (no shared refs). */
export function seedWarehouse(): AcmeWarehouse {
  return {
    team: {
      id: 'TEAM-ACME',
      name: 'Acme Platform',
      memberIds: ['USR-ADA', 'USR-MARCO', 'USR-WEI', 'USR-DEVI', 'USR-TOM', 'USR-PETE'],
    },
    members: [
      { id: 'USR-ADA', name: 'Ada L.' },
      { id: 'USR-MARCO', name: 'Marco P.' },
      { id: 'USR-WEI', name: 'Wei C.' },
      { id: 'USR-DEVI', name: 'Devi R.' },
      { id: 'USR-TOM', name: 'Tom B.' },
      // Engineering manager — flagged so they don't dilute team capacity.
      { id: 'USR-PETE', name: 'Pete O.', nonContributing: true },
    ],
    modules: [
      { id: 'MOD-CHK', name: 'Checkout API' },
      { id: 'MOD-SRCH', name: 'Search Revamp' },
      { id: 'MOD-BILL', name: 'Billing Migration' },
    ],
    cycles: [
      { id: 'CYC-1', name: 'Iteration 1', start: '2026-04-13', end: '2026-04-26' },
      { id: 'CYC-2', name: 'Iteration 2', start: '2026-04-27', end: '2026-05-10' },
      { id: 'CYC-3', name: 'Iteration 3', start: '2026-05-11', end: '2026-05-24' },
    ],
    tickets: [
      { id: 'ACME-101', typeId: 'acme_story', title: 'Tokenize card vault', body: 'PCI-scoped vault for card tokens.', state: 'done', estimate: 5, moduleId: 'MOD-CHK', cycleId: 'CYC-1', assigneeId: 'USR-ADA' },
      { id: 'ACME-102', typeId: 'acme_story', title: 'Idempotent charge endpoint', body: '', state: 'in_progress', estimate: 3, moduleId: 'MOD-CHK', cycleId: 'CYC-1', assigneeId: 'USR-MARCO' },
      // 'qa' and 'in_review' both map to the Under Review category — the native
      // labels ("QA Verify" vs "In Review") are what the vocabulary preserves.
      { id: 'ACME-103', typeId: 'acme_story', title: '3-D Secure handshake', body: '', state: 'qa', estimate: 8, moduleId: 'MOD-CHK', cycleId: 'CYC-2', assigneeId: 'USR-WEI' },
      { id: 'ACME-110', typeId: 'acme_story', title: 'Typeahead suggestions', body: '', state: 'done', estimate: 3, moduleId: 'MOD-SRCH', cycleId: 'CYC-1', assigneeId: 'USR-DEVI' },
      { id: 'ACME-111', typeId: 'acme_task', title: 'Relevance ranking model', body: '', state: 'blocked', estimate: 5, moduleId: 'MOD-SRCH', cycleId: 'CYC-2', assigneeId: 'USR-TOM' },
      { id: 'ACME-120', typeId: 'acme_story', title: 'Dual-write ledger', body: '', state: 'in_progress', estimate: 8, moduleId: 'MOD-BILL', cycleId: 'CYC-2', assigneeId: 'USR-ADA' },
      { id: 'ACME-121', typeId: 'acme_story', title: 'Proration engine', body: '', state: 'todo', estimate: 5, moduleId: 'MOD-BILL', cycleId: 'CYC-3', assigneeId: 'USR-MARCO' },
      // Unscheduled (no cycle) -> lands in the backlog. Unassigned.
      { id: 'ACME-122', typeId: 'acme_bug', title: 'Legacy data backfill drops rows', body: 'Backfill loses rows when the source page boundary splits a record.', state: 'todo', estimate: 3, moduleId: 'MOD-BILL', cycleId: null, assigneeId: null, severity: 'high' },
    ],
    seq: 0,
  };
}
