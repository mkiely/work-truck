// Hono app: the three contract routes, CORS for the app, and a JSON error wrapper.
// Routes are backend-agnostic — they only touch the registry and the Connector
// interface, so adding a backend never changes this file.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { CONNECTORS, getConnector } from './registry.js';
import type { ReleaseConnectorPayload, ValidateRequest } from './contract.js';

// Explicit allowlist (comma-separated). Empty by default — see allowOrigin below.
const APP_ORIGINS = (process.env.APP_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Vite hops ports when one is taken (5173 -> 5174 -> ...), which silently breaks a
// fixed allowlist. This is a local-only dev tool, so by default we accept any
// localhost / 127.0.0.1 origin on any port. Set APP_ORIGIN to lock it to an explicit
// list instead (that list is then authoritative).
function allowOrigin(origin: string): string | null {
  if (APP_ORIGINS.length) return APP_ORIGINS.includes(origin) ? origin : null;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null;
}

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', cors({ origin: allowOrigin }));

  // GET /connectors — advertise available connectors + the config each needs.
  app.get('/connectors', (c) => c.json(Object.values(CONNECTORS).map((x) => x.meta)));

  // POST /connectors/:type/validate — check config (and later creds) before saving.
  app.post('/connectors/:type/validate', async (c) => {
    const conn = getConnector(c.req.param('type'));
    if (!conn) return c.json({ ok: false, error: 'Unknown connector' }, 404);
    const body = await c.req.json<ValidateRequest>();
    return c.json(await conn.validate(body.config ?? {}));
  });

  // POST /releases/sync — the app's real call (no id; body { connector }).
  // POST /releases/:id/sync — the OpenAPI spec form. Both delegate to one handler.
  const syncHandler = async (c: Context) => {
    const body = await c.req.json<{ connector: ReleaseConnectorPayload }>();
    const connector = body.connector;
    if (!connector?.type) return c.json({ error: 'Missing connector.type' }, 400);
    const conn = getConnector(connector.type);
    if (!conn) return c.json({ error: 'Unknown connector' }, 404);
    return c.json(await conn.fetchAndMap(connector.config ?? {}));
  };
  app.post('/releases/sync', syncHandler);
  app.post('/releases/:id/sync', syncHandler);

  // Turn thrown errors (e.g. mapping/fetch failures) into clean JSON responses.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    const message = err instanceof Error ? err.message : 'Internal error';
    return c.json({ error: message }, 500);
  });

  return app;
}
