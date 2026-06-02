// AcmeConnector — example CLI-backed connector. Use this as a starting point for any
// backend that exposes a CLI with JSON output.
//
// STATUS: stub. It compiles and works against fixtures today. To finish it:
//   1. Make fixtures.ts mirror your CLI's real JSON output.
//   2. Adjust mapping.ts (field reads + coerceStatus) to your tool's vocabulary.
//   3. Fill in the real `runJson(...)` call below (the command + args).
//   4. Set the configFields the app's create-form should collect.
//   5. Enable it: run the service with ENABLE_ACME=1 (see registry.ts), or register
//      unconditionally once you're confident.
//
// See CONNECTORS.md for the full checklist.

import type { Connector } from '../types.js';
import { checkRequired } from '../types.js';
import type { MappedRelease } from '../../contract.js';
import { acmeFixture } from './fixtures.js';
import { mapAcme } from './mapping.js';
import { runJson } from '../../lib/exec.js';
import type { AcmeExport } from './fixtures.js';

const USE_MOCK = process.env.MOCK !== '0';

export const AcmeConnector: Connector = {
  meta: {
    type: 'acme', // TODO(acme): your connector id (lowercase, e.g. 'phoenix')
    label: 'Acme Tracker', // TODO(acme): display name shown in the app
    configFields: [
      // TODO(acme): the non-secret routing params the app should collect. NO secrets
      // here — tokens live in this service's env, keyed off the connector.
      { key: 'project', label: 'Project', required: true, hint: 'e.g. PHX' },
      { key: 'release', label: 'Release', required: true, hint: 'e.g. 5.0' },
    ],
  },

  async validate(config) {
    // Structural check now. Later: a cheap CLI probe (e.g. `acme-cli whoami --json`).
    return checkRequired(AcmeConnector.meta, config);
  },

  async fetchAndMap(config): Promise<MappedRelease> {
    const v = await this.validate(config);
    if (!v.ok) throw new Error(v.error ?? 'Invalid connector config');

    if (USE_MOCK) {
      return mapAcme(acmeFixture());
    }

    // TODO(acme): real fetch. Example shape — replace bin/args with your tool's:
    //   const raw = await runJson<AcmeExport>('acme-cli', [
    //     'issues', '--project', config.project, '--release', config.release, '--json',
    //   ], { timeoutMs: 60_000, env: { ACME_TOKEN: process.env.ACME_TOKEN! } });
    //   return mapAcme(raw);
    void runJson; // keep the import wired until the real call lands
    throw new Error('Acme CLI fetch not implemented yet; run with MOCK=1 (default) to use fixtures');
  },
};

export type { AcmeExport };
