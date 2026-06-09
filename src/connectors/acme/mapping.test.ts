import { beforeEach, describe, expect, it } from 'vitest';
import { coerceStatus, mapAcme, toRawState } from './mapping.js';
import { seedWarehouse } from './fixtures.js';
import { resetWarehouse } from './warehouse.js';
import { AcmeConnector } from './index.js';

const CANONICAL = ['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete'] as const;

describe('acme coerceStatus', () => {
  it('maps raw state strings to the five canonical statuses', () => {
    expect(coerceStatus('todo')).toBe('Not Started');
    expect(coerceStatus('open')).toBe('Not Started');
    expect(coerceStatus('in_progress')).toBe('In Progress');
    expect(coerceStatus('in_review')).toBe('Under Review');
    expect(coerceStatus('blocked')).toBe('Blocked');
    expect(coerceStatus('done')).toBe('Complete');
  });

  it('round-trips through toRawState back to the same canonical status', () => {
    for (const status of CANONICAL) {
      expect(coerceStatus(toRawState(status))).toBe(status);
    }
  });
});

describe('mapAcme', () => {
  const out = mapAcme(seedWarehouse());

  it('maps the team + members, flagging non-contributing members', () => {
    expect(out.team?.externalId).toBe('TEAM-ACME');
    expect(out.team?.fields.name).toBe('Acme Platform');
    const pete = out.team?.members.find((m) => m.externalId === 'USR-PETE');
    expect(pete?.fields.nonContributing).toBe(true);
    const ada = out.team?.members.find((m) => m.externalId === 'USR-ADA');
    expect(ada?.fields.nonContributing).toBeUndefined();
  });

  it('maps modules/cycles into work streams/sprints', () => {
    expect(out.workStreams[0]).toEqual({ externalId: 'MOD-CHK', fields: { name: 'Checkout API' } });
    expect(out.sprints[0]).toEqual({
      externalId: 'CYC-1',
      fields: { name: 'Iteration 1', startISO: '2026-04-13', endISO: '2026-04-26' },
    });
  });

  it('maps a ticket with assignee + itemType', () => {
    const item = out.items.find((i) => i.externalId === 'ACME-101')!;
    expect(item.extWorkStreamId).toBe('MOD-CHK');
    expect(item.extSprintId).toBe('CYC-1');
    expect(item.extAssigneeId).toBe('USR-ADA');
    expect(item.fields.status).toBe('Complete');
    expect(item.fields.itemType).toEqual({ id: 'acme_story', label: 'Story' });
  });

  it('represents an unscheduled ticket as backlog (extSprintId null) and unassigned', () => {
    const item = out.items.find((i) => i.externalId === 'ACME-122')!;
    expect(item.extSprintId).toBeNull();
    expect(item.extAssigneeId).toBeNull();
  });

  it('only ever emits canonical statuses', () => {
    const allowed = new Set<string>(CANONICAL);
    for (const i of out.items) expect(allowed.has(i.fields.status)).toBe(true);
  });

  it('emits catalog-declared vocabulary as attributes; omits the bag otherwise', () => {
    const bugItem = out.items.find((i) => i.externalId === 'ACME-122')!;
    expect(bugItem.attributes).toEqual({ severity: 'high' });
    const story = out.items.find((i) => i.externalId === 'ACME-101')!;
    expect(story.attributes).toBeUndefined();
  });
});

describe('AcmeConnector bidirectional behavior', () => {
  beforeEach(() => resetWarehouse());

  it('push applies writeable points + sprint and the change survives a re-sync', async () => {
    const res = await AcmeConnector.push!({}, [
      { externalId: 'ACME-102', fields: { points: 13, extSprintId: 'CYC-3' } },
      { externalId: 'ACME-122', fields: { extSprintId: null } }, // already backlog; stays null
    ]);
    expect(res).toEqual({ pushed: 2, failed: 0, errors: [] });

    const synced = await AcmeConnector.fetchAndMap({});
    const item = synced.items.find((i) => i.externalId === 'ACME-102')!;
    expect(item.fields.points).toBe(13);
    expect(item.extSprintId).toBe('CYC-3');
  });

  it('push applies a writeable vocabulary field and drops invalid values', async () => {
    const res = await AcmeConnector.push!({}, [
      { externalId: 'ACME-122', fields: { attributes: { severity: 'critical', rawJunk: 'x' } } },
    ]);
    expect(res.pushed).toBe(1);

    const synced = await AcmeConnector.fetchAndMap({});
    const bug = synced.items.find((i) => i.externalId === 'ACME-122')!;
    expect(bug.attributes).toEqual({ severity: 'critical' });

    // An out-of-options enum value is dropped at the boundary — severity unchanged.
    await AcmeConnector.push!({}, [
      { externalId: 'ACME-122', fields: { attributes: { severity: 'not-a-severity' } } },
    ]);
    const again = await AcmeConnector.fetchAndMap({});
    expect(again.items.find((i) => i.externalId === 'ACME-122')!.attributes).toEqual({ severity: 'critical' });
  });

  it('push reports unknown items as failed without aborting the batch', async () => {
    const res = await AcmeConnector.push!({}, [
      { externalId: 'ACME-101', fields: { points: 1 } },
      { externalId: 'NOPE-999', fields: { points: 2 } },
    ]);
    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.errors[0]).toContain('NOPE-999');
  });

  it('createItem persists vocabulary fields and round-trips them as attributes', async () => {
    const created = await AcmeConnector.createItem!({}, {
      type: 'acme_bug',
      extWorkStreamId: 'MOD-CHK',
      extSprintId: null,
      extAssigneeId: null,
      fields: { subject: 'Crash on submit', severity: 'critical' },
    });
    expect(created.attributes).toEqual({ severity: 'critical' });

    // The value survives in the warehouse and comes back on the next sync.
    const synced = await AcmeConnector.fetchAndMap({});
    const again = synced.items.find((i) => i.externalId === created.externalId)!;
    expect(again.attributes).toEqual({ severity: 'critical' });
  });

  it('createItem allocates an id/key, persists, and returns a reconcilable item', async () => {
    const created = await AcmeConnector.createItem!({}, {
      type: 'acme_task',
      extWorkStreamId: 'MOD-SRCH',
      extSprintId: 'CYC-1',
      extAssigneeId: 'USR-TOM',
      fields: { subject: 'Smoke test item', points: 2, status: 'In Progress' },
    });

    expect(created.externalId).toMatch(/^ACME-\d+$/);
    expect(created.fields.key).toBe(created.externalId);
    expect(created.fields.subject).toBe('Smoke test item');
    expect(created.fields.status).toBe('In Progress');
    expect(created.fields.itemType).toEqual({ id: 'acme_task', label: 'Task' });

    // It shows up on the next sync.
    const synced = await AcmeConnector.fetchAndMap({});
    expect(synced.items.some((i) => i.externalId === created.externalId)).toBe(true);
  });
});
