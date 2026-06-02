import { describe, expect, it } from 'vitest';
import { coerceStatus, mapAcme } from './mapping.js';
import { acmeFixture } from './fixtures.js';

// TODO(acme): expand these once fixtures.ts reflects your tool's real output. They
// exist now so the stub is exercised and the four-status invariant is guarded.

describe('acme coerceStatus', () => {
  it('maps raw status strings to canonical statuses', () => {
    expect(coerceStatus('open')).toBe('Not Started');
    expect(coerceStatus('in_progress')).toBe('Active');
    expect(coerceStatus('blocked')).toBe('Blocked');
    expect(coerceStatus('done')).toBe('Complete');
  });
});

describe('mapAcme', () => {
  const out = mapAcme(acmeFixture());

  it('maps modules/cycles/tickets into the contract shape', () => {
    expect(out.workStreams[0]).toEqual({ externalId: 'MOD-1', fields: { name: 'Platform' } });
    expect(out.sprints[0]).toEqual({
      externalId: 'CYC-1',
      fields: { name: 'Iteration 1', startISO: '2026-04-13', endISO: '2026-04-26' },
    });
  });

  it('represents an unscheduled ticket with extSprintId null (backlog)', () => {
    const item = out.items.find((i) => i.externalId === 'PHX-4')!;
    expect(item.extSprintId).toBeNull();
  });

  it('only ever emits the four canonical statuses', () => {
    const allowed = new Set(['Not Started', 'Active', 'Blocked', 'Complete']);
    for (const i of out.items) expect(allowed.has(i.fields.status)).toBe(true);
  });
});
