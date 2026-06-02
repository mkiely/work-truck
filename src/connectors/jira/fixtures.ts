// Canned RAW JIRA JSON — the shapes JIRA's REST API actually returns, before mapping.
// This is Tier 0 from the handoff: it lets us build and unit-test the mapping pipeline
// with zero network. Themed like the app's "Atlas 4.0" seed
// (release-tracker/src/sync/fixtures.ts) so a synced release looks familiar.
//
// When step 4 (live JIRA Cloud) lands, the real fetch produces these same shapes and
// mapJira() stays unchanged.

// --- Raw shapes (subset of JIRA's REST responses that the mapper consumes) ---

/** GET /rest/agile/1.0/board/{boardId}/sprint -> { values: JiraSprint[] } */
export interface JiraSprint {
  id: number;
  name: string;
  startDate?: string; // ISO datetime
  endDate?: string; // ISO datetime
}

/** GET /rest/agile/1.0/board/{boardId}/epic -> { values: JiraEpic[] } */
export interface JiraEpic {
  id: number;
  key: string;
  name: string;
}

export interface JiraStatusCategory {
  key: string; // 'new' | 'indeterminate' | 'done'
  name: string; // 'To Do' | 'In Progress' | 'Done'
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status: { name: string; statusCategory: JiraStatusCategory };
    /** Flagged/Impeded indicator (Atlassian "Flagged" custom field is an array when set). */
    flagged?: boolean;
    /** Story points — configurable field id, defaults to customfield_10016. */
    [customField: string]: unknown;
    epic?: { id: number; key: string; name: string } | null;
    sprint?: { id: number } | null;
  };
}

/** What a fetch layer would assemble before mapping. */
export interface JiraRaw {
  sprints: JiraSprint[];
  epics: JiraEpic[];
  issues: JiraIssue[];
  /** The story-points custom field id in use (config.storyPointsField). */
  storyPointsField: string;
}

const SPF = 'customfield_10016';

export function jiraFixture(): JiraRaw {
  const epics: JiraEpic[] = [
    { id: 9001, key: 'EPIC-CHK', name: 'Checkout API' },
    { id: 9002, key: 'EPIC-SRCH', name: 'Search Revamp' },
    { id: 9003, key: 'EPIC-BILL', name: 'Billing Migration' },
  ];

  const sprints: JiraSprint[] = [
    { id: 101, name: 'ATL Sprint 1', startDate: '2026-04-13T09:00:00.000Z', endDate: '2026-04-26T17:00:00.000Z' },
    { id: 102, name: 'ATL Sprint 2', startDate: '2026-04-27T09:00:00.000Z', endDate: '2026-05-10T17:00:00.000Z' },
    { id: 103, name: 'ATL Sprint 3', startDate: '2026-05-11T09:00:00.000Z', endDate: '2026-05-24T17:00:00.000Z' },
  ];

  const issue = (
    key: string,
    summary: string,
    description: string,
    statusName: string,
    category: JiraStatusCategory,
    points: number,
    epic: JiraEpic,
    sprintId: number | null,
    flagged = false,
  ): JiraIssue => ({
    key,
    fields: {
      summary,
      description,
      status: { name: statusName, statusCategory: category },
      flagged,
      [SPF]: points,
      epic: { id: epic.id, key: epic.key, name: epic.name },
      sprint: sprintId === null ? null : { id: sprintId },
    },
  });

  const TODO: JiraStatusCategory = { key: 'new', name: 'To Do' };
  const PROG: JiraStatusCategory = { key: 'indeterminate', name: 'In Progress' };
  const DONE: JiraStatusCategory = { key: 'done', name: 'Done' };

  const [chk, srch, bill] = epics;

  const issues: JiraIssue[] = [
    issue('ATL-101', 'Tokenize card vault', 'PCI-scoped vault for card tokens.', 'Done', DONE, 5, chk!, 101),
    issue('ATL-102', 'Idempotent charge endpoint', '', 'In Progress', PROG, 3, chk!, 101),
    issue('ATL-103', '3-D Secure handshake', '', 'In Progress', PROG, 8, chk!, 102),
    issue('ATL-110', 'Typeahead suggestions', '', 'Done', DONE, 3, srch!, 101),
    // Flagged in progress -> must coerce to Blocked, not Active.
    issue('ATL-111', 'Relevance ranking model', '', 'In Progress', PROG, 5, srch!, 102, true),
    issue('ATL-120', 'Dual-write ledger', '', 'In Progress', PROG, 8, bill!, 102),
    issue('ATL-121', 'Proration engine', '', 'To Do', TODO, 5, bill!, 103),
    // Unscheduled (no sprint) -> app drops into backlog.
    issue('ATL-122', 'Legacy data backfill', '', 'To Do', TODO, 3, bill!, null),
  ];

  return { sprints, epics, issues, storyPointsField: SPF };
}
