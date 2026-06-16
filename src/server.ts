// Hono app: the three contract routes, CORS for the app, and a JSON error wrapper.
// Routes are backend-agnostic — they only touch the registry and the Connector
// interface, so adding a backend never changes this file.

import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { HTTPException } from 'hono/http-exception';
import { ValidationError } from './lib/validate.js';
import { CONNECTORS, getConnector } from './registry.js';
import type { CreateItemRequest, PushRequest, ReleaseConnectorPayload, ValidateRequest } from './contract.js';

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

// Where the bundled SPA lives. SERVE_APP overrides (e.g. a local `../release-tracker/dist`
// build); otherwise default to the pinned `release-tracker` dependency's prebuilt dist.
// Paths are relative to cwd — @hono/node-server's serveStatic does not accept absolute
// roots — so run the service from the work-truck root (npm start does).
const APP_DIST = process.env.SERVE_APP ?? 'node_modules/release-tracker/dist';
const SERVE_APP = process.env.SERVE_APP !== undefined || existsSync(APP_DIST);

export function createApp(): Hono {
  const app = new Hono();

  // When we serve the SPA ourselves (single-origin prod) CORS is unnecessary. Keep it
  // for the cross-origin dev path (vite :5173 → :8787) and whenever APP_ORIGIN is set.
  if (!SERVE_APP || APP_ORIGINS.length || process.env.NODE_ENV !== 'production') {
    app.use('*', cors({ origin: allowOrigin }));
  }

  // GET /connectors — advertise available connectors + the config each needs.
  app.get('/connectors', (c) => c.json(Object.values(CONNECTORS).map((x) => x.meta)));

  // POST /connectors/:type/validate — check config (and later creds) before saving.
  app.post('/connectors/:type/validate', async (c) => {
    const conn = getConnector(c.req.param('type'));
    if (!conn) return c.json({ ok: false, error: 'Unknown connector' }, 404);
    const body = await c.req.json<ValidateRequest>();
    return c.json(await conn.validate(body.config ?? {}));
  });

  // POST /releases/sync — body { connector }.
  app.post('/releases/sync', async (c: Context) => {
    const body = await c.req.json<{ connector: ReleaseConnectorPayload }>();
    const connector = body.connector;
    if (!connector?.type) return c.json({ error: 'Missing connector.type' }, 400);
    const conn = getConnector(connector.type);
    if (!conn) return c.json({ error: 'Unknown connector' }, 404);
    return c.json(await conn.fetchAndMap(connector.config ?? {}));
  });

  // POST /releases/push — body { connector, changes }.
  app.post('/releases/push', async (c: Context) => {
    const body = await c.req.json<PushRequest>();
    const connector = body.connector;
    if (!connector?.type) return c.json({ error: 'Missing connector.type' }, 400);
    const conn = getConnector(connector.type);
    if (!conn) return c.json({ error: 'Unknown connector' }, 404);
    if (!conn.push) return c.json({ error: 'Connector does not support push' }, 400);
    return c.json(await conn.push(connector.config ?? {}, body.changes ?? []));
  });

  // POST /releases/items — body { connector, ...createInput }.
  app.post('/releases/items', async (c: Context) => {
    const { connector, ...req } = await c.req.json<CreateItemRequest>();
    if (!connector?.type) return c.json({ error: 'Missing connector.type' }, 400);
    const conn = getConnector(connector.type);
    if (!conn) return c.json({ error: 'Unknown connector' }, 404);
    if (!conn.createItem) return c.json({ error: 'Connector does not support item creation' }, 400);
    return c.json(await conn.createItem(connector.config ?? {}, req));
  });

  // Serve the bundled SPA on the same origin as the API (registered AFTER the contract
  // routes, so /connectors and /releases/* always win). Unknown GETs fall through to
  // index.html for client-side routing. No-op when no app dist is present (pure dev API).
  if (SERVE_APP) {
    app.use('/assets/*', serveStatic({ root: APP_DIST }));
    app.get('*', serveStatic({ path: 'index.html', root: APP_DIST }));
  }

  // Turn thrown errors (e.g. mapping/fetch failures) into clean JSON responses.
  // Connector validation failures become the contract's 422 ValidationProblem.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, fieldErrors: err.fieldErrors }, 422);
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return c.json({ error: message }, 500);
  });

  return app;
}
