// startServer: create the app and listen. The 3-line entrypoint for both this repo
// (src/index.ts) and private host repos, which pass their out-of-tree connectors in.

import { serve } from '@hono/node-server';
import { createApp } from './server.js';
import type { CreateAppOptions } from './server.js';

export interface StartServerOptions extends CreateAppOptions {
  /** Listen port. Defaults to PORT env, then 8787 (matching the app's VITE_SYNC_BASE_URL). */
  port?: number;
}

export function startServer(options: StartServerOptions = {}): void {
  const { port, ...appOptions } = options;
  const app = createApp(appOptions);

  serve({ fetch: app.fetch, port: port ?? Number(process.env.PORT ?? 8787) }, (info) => {
    console.log(`[work-truck] sync service listening on http://localhost:${info.port}`);
  });
}
