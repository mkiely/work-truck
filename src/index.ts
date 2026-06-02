// Entrypoint: start the HTTP server. Reads PORT (default 8787, matching the app's
// expected VITE_SYNC_BASE_URL).

import { serve } from '@hono/node-server';
import { createApp } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[work-truck] sync service listening on http://localhost:${info.port}`);
});
