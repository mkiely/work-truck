// TODO(acme): replace these placeholder shapes + sample with your CLI tool's REAL
// JSON output. Run your tool once (e.g. `acme-cli issues --project PHX --release 5.0
// --json`), paste a representative payload here, and adjust the interfaces to match.
//
// Keeping a fixture lets you build and unit-test mapAcme() with zero access to the
// real tool (Tier 0 from the handoff). The fetch layer (src/lib/exec.ts) will later
// produce these same shapes.

/** A work stream / epic. */
export interface AcmeModule {
  id: string;
  name: string;
}

/** A sprint / iteration. */
export interface AcmeCycle {
  id: string;
  name: string;
  start: string; // TODO: confirm format (the mapper converts to YYYY-MM-DD)
  end: string;
}

/** A work item / ticket. */
export interface AcmeTicket {
  id: string;
  title: string;
  body: string;
  state: string; // raw status string — coerced to canonical values in mapping.ts
  estimate: number; // story points
  moduleId: string | null; // -> extWorkStreamId
  cycleId: string | null; // -> extSprintId (null = backlog)
}

/** Whatever your CLI prints as a single JSON document. */
export interface AcmeExport {
  modules: AcmeModule[];
  cycles: AcmeCycle[];
  tickets: AcmeTicket[];
}

export function acmeFixture(): AcmeExport {
  return {
    modules: [
      { id: 'MOD-1', name: 'Platform' },
      { id: 'MOD-2', name: 'Payments' },
    ],
    cycles: [
      { id: 'CYC-1', name: 'Iteration 1', start: '2026-04-13', end: '2026-04-26' },
      { id: 'CYC-2', name: 'Iteration 2', start: '2026-04-27', end: '2026-05-10' },
    ],
    tickets: [
      { id: 'PHX-1', title: 'Bootstrap service', body: '', state: 'done', estimate: 5, moduleId: 'MOD-1', cycleId: 'CYC-1' },
      { id: 'PHX-2', title: 'Wire health checks', body: '', state: 'in_progress', estimate: 3, moduleId: 'MOD-1', cycleId: 'CYC-1' },
      { id: 'PHX-3', title: 'Settlement batch job', body: '', state: 'blocked', estimate: 8, moduleId: 'MOD-2', cycleId: 'CYC-2' },
      // Unscheduled -> backlog.
      { id: 'PHX-4', title: 'Refund reconciliation', body: '', state: 'open', estimate: 5, moduleId: 'MOD-2', cycleId: null },
    ],
  };
}
