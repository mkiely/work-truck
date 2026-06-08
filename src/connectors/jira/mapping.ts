// Pure mapping: raw JIRA JSON -> MappedRelease (the app's contract shape).
// No I/O here so it's trivially unit-testable. The fetch layer (fixtures now, live
// JIRA later) hands us a JiraRaw; we translate and coerce.

import type { ContractStatus, MappedRelease } from '../../contract.js';
import type { JiraIssue, JiraRaw, JiraStatusCategory } from './fixtures.js';

/**
 * Coerce a JIRA issue's status to the contract's canonical values. We never pass raw
 * status through (handoff §5.4):
 *  - statusCategory: To Do -> Not Started, In Progress -> In Progress, Done -> Complete
 *  - a flagged/blocked/impeded issue overrides In Progress -> Blocked
 */
export function coerceStatus(status: { name: string; statusCategory: JiraStatusCategory }, flagged?: boolean): ContractStatus {
  const name = status.name?.toLowerCase() ?? '';
  if (flagged || name.includes('block') || name.includes('imped') || name.includes('flag')) {
    return 'Blocked';
  }
  switch (status.statusCategory.key) {
    case 'done':
      return 'Complete';
    case 'indeterminate':
      return 'In Progress';
    case 'new':
    default:
      return 'Not Started';
  }
}

/** JIRA returns ISO datetimes; the contract wants YYYY-MM-DD. */
function toDateOnly(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function readPoints(issue: JiraIssue, storyPointsField: string): number {
  const raw = issue.fields[storyPointsField];
  return typeof raw === 'number' ? raw : 0;
}

export function mapJira(raw: JiraRaw): MappedRelease {
  const workStreams = raw.epics.map((e) => ({
    externalId: e.key,
    fields: { name: e.name },
  }));

  const sprints = raw.sprints.map((s) => ({
    externalId: String(s.id),
    fields: {
      name: s.name,
      startISO: toDateOnly(s.startDate),
      endISO: toDateOnly(s.endDate),
    },
  }));

  const items = raw.issues.map((issue) => ({
    externalId: issue.key,
    extWorkStreamId: issue.fields.epic?.key ?? null,
    extSprintId: issue.fields.sprint ? String(issue.fields.sprint.id) : null,
    // Assignees aren't modeled in this fixture-only JIRA connector yet; the contract
    // requires the field, so emit null (unassigned). Wire it up with the live fetch.
    extAssigneeId: null,
    fields: {
      key: issue.key,
      subject: issue.fields.summary,
      description: issue.fields.description ?? '',
      status: coerceStatus(issue.fields.status, issue.fields.flagged),
      points: readPoints(issue, raw.storyPointsField),
    },
  }));

  return { workStreams, sprints, items };
}
