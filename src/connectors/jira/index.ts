// JIRA connector. For now it maps offline fixtures (Tier 0); the live JIRA Cloud
// fetch is a marked seam for step 4. `meta.configFields` matches exactly what the app
// already advertises (release-tracker/src/sync/fixtures.ts) so the app's create-form
// and this service agree.

import type { Connector } from '../types.js';
import { checkRequired } from '../types.js';
import type { MappedRelease } from '../../contract.js';
import { jiraFixture } from './fixtures.js';
import { mapJira } from './mapping.js';

const USE_MOCK = process.env.MOCK !== '0';

export const JiraConnector: Connector = {
  meta: {
    type: 'jira',
    label: 'Jira',
    configFields: [
      { key: 'projectKey', label: 'Project key', required: true, hint: 'e.g. ATL' },
      { key: 'boardId', label: 'Board ID', required: true, hint: 'numeric; sprints come from this board' },
      { key: 'fixVersion', label: 'Fix version', required: true, hint: 'e.g. 4.0' },
      { key: 'siteUrl', label: 'Site URL', required: true, hint: 'e.g. acme.atlassian.net' },
      { key: 'storyPointsField', label: 'Story-points field id', required: false, hint: 'defaults to customfield_10016' },
    ],
  },

  async validate(config) {
    // Structural check only for now. Step 4 adds a real cheap auth probe against siteUrl.
    return checkRequired(JiraConnector.meta, config);
  },

  async fetchAndMap(config): Promise<MappedRelease> {
    const v = await this.validate(config);
    if (!v.ok) throw new Error(v.error ?? 'Invalid connector config');

    if (USE_MOCK) {
      return mapJira(jiraFixture());
    }

    // TODO (step 4): live JIRA Cloud fetch via src/lib/http.ts:
    //   1. GET /rest/agile/1.0/board/{boardId}/sprint        -> sprints
    //   2. GET /rest/api/3/search  (project = {projectKey} AND fixVersion = "{fixVersion}")
    //   3. derive epics (or GET /rest/agile/1.0/board/{boardId}/epic)
    // assemble a JiraRaw, then mapJira(raw). Credentials from env, never from config.
    throw new Error('Live JIRA fetch not implemented yet; run with MOCK=1');
  },
};
