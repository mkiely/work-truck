import { describe, expect, it } from 'vitest';
import { coerceStatus, mapJira } from './mapping.js';
import { jiraFixture } from './fixtures.js';
import type { JiraStatusCategory } from './fixtures.js';

const TODO: JiraStatusCategory = { key: 'new', name: 'To Do' };
const PROG: JiraStatusCategory = { key: 'indeterminate', name: 'In Progress' };
const DONE: JiraStatusCategory = { key: 'done', name: 'Done' };

describe('coerceStatus', () => {
  it('maps each status category to a canonical status', () => {
    expect(coerceStatus({ name: 'To Do', statusCategory: TODO })).toBe('Not Started');
    expect(coerceStatus({ name: 'In Progress', statusCategory: PROG })).toBe('In Progress');
    expect(coerceStatus({ name: 'Done', statusCategory: DONE })).toBe('Complete');
  });

  it('coerces flagged/blocked/impeded to Blocked regardless of category', () => {
    expect(coerceStatus({ name: 'In Progress', statusCategory: PROG }, true)).toBe('Blocked');
    expect(coerceStatus({ name: 'Blocked', statusCategory: PROG })).toBe('Blocked');
    expect(coerceStatus({ name: 'Impeded', statusCategory: PROG })).toBe('Blocked');
    expect(coerceStatus({ name: 'Flagged', statusCategory: TODO })).toBe('Blocked');
  });
});

describe('mapJira', () => {
  const out = mapJira(jiraFixture());

  it('maps epics to work streams keyed by epic key', () => {
    expect(out.workStreams).toEqual([
      { externalId: 'EPIC-CHK', fields: { name: 'Checkout API' } },
      { externalId: 'EPIC-SRCH', fields: { name: 'Search Revamp' } },
      { externalId: 'EPIC-BILL', fields: { name: 'Billing Migration' } },
    ]);
  });

  it('maps sprints with date-only ISO and string ids', () => {
    expect(out.sprints[0]).toEqual({
      externalId: '101',
      fields: { name: 'ATL Sprint 1', startISO: '2026-04-13', endISO: '2026-04-26' },
    });
  });

  it('links items to external epic and sprint ids', () => {
    const item = out.items.find((i) => i.externalId === 'ATL-103')!;
    expect(item.extWorkStreamId).toBe('EPIC-CHK');
    expect(item.extSprintId).toBe('102');
    expect(item.fields).toMatchObject({ key: 'ATL-103', subject: '3-D Secure handshake', status: 'In Progress', points: 8 });
  });

  it('coerces a flagged in-progress issue to Blocked', () => {
    const item = out.items.find((i) => i.externalId === 'ATL-111')!;
    expect(item.fields.status).toBe('Blocked');
  });

  it('represents an unscheduled issue with extSprintId null (backlog)', () => {
    const item = out.items.find((i) => i.externalId === 'ATL-122')!;
    expect(item.extSprintId).toBeNull();
    expect(item.extWorkStreamId).toBe('EPIC-BILL');
  });

  it('only ever emits canonical statuses', () => {
    const allowed = new Set(['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete']);
    for (const i of out.items) expect(allowed.has(i.fields.status)).toBe(true);
  });
});
