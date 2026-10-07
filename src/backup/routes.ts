// The backup's HTTP surface: GET /backup/meta, GET /backup, PUT /backup.
//
// Two guards apply that the sync routes don't spell out:
//
//   - Origin. CORS only stops another site *reading* a response; it does not stop a
//     page on any site firing a request at localhost and having it run. A request
//     whose Origin is present and neither ours nor allowed is refused outright.
//   - Content-Type. A PUT must be application/json. That makes it a non-"simple"
//     request, so a browser has to preflight it — and the preflight fails for a
//     disallowed origin before the body is ever sent.
//
// The envelope is validated only for its outer shape; `state` and `prefs` are the
// app's business. See ./store.ts for why this module never touches a connector.

import { inflateSync } from 'node:zlib';
import type { Context, Hono } from 'hono';
import type { BackupConflict, BackupEnvelope } from '../contract.js';
import type { BackupStore, ExpectedRev } from './store.js';

export interface BackupRouteOptions {
  /** The same predicate the CORS middleware uses; null/undefined = not allowed. */
  allowOrigin(origin: string): string | null | undefined;
  /** Largest accepted body in bytes, compressed or not. */
  maxBytes: number;
}

export function mountBackup(app: Hono, store: BackupStore, opts: BackupRouteOptions): void {
  app.use('/backup', guardOrigin(opts));
  app.use('/backup/*', guardOrigin(opts));

  app.get('/backup/meta', async (c) => {
    const meta = await store.getMeta();
    return meta ? c.json(meta) : c.json({ error: 'No backup stored' }, 404);
  });

  app.get('/backup', async (c) => {
    const found = await store.read();
    if (!found) return c.json({ error: 'No backup stored' }, 404);
    // The stored bytes go back verbatim — re-serializing would mean parsing a
    // document this service has no business interpreting.
    return c.body(found.body, 200, { 'Content-Type': 'application/json', ETag: `"${found.meta.rev}"` });
  });

  app.put('/backup', async (c) => {
    if (!isJson(c.req.header('Content-Type'))) {
      return c.json({ error: 'Content-Type must be application/json' }, 415);
    }
    const expected = expectedRev(c);
    if (expected === 'missing') {
      return c.json({ error: 'Send If-Match: "<rev>", or If-None-Match: * for the first backup' }, 428);
    }

    const body = await readBody(c, opts.maxBytes);
    if (body === 'too-large') return c.json({ error: `Backup exceeds ${opts.maxBytes} bytes` }, 413);
    if (body === 'bad-encoding') return c.json({ error: 'Body could not be decompressed' }, 400);

    const envelope = parseEnvelope(body);
    if (typeof envelope === 'string') return c.json({ error: envelope }, 400);

    const result = await store.write(body, envelope.savedAt, expected);
    if (!result.ok) {
      const conflict: BackupConflict = { error: 'Backup changed since you last read it', current: result.current };
      return c.json(conflict, 409);
    }
    return c.json(result.meta);
  });
}

function guardOrigin(opts: BackupRouteOptions) {
  return async (c: Context, next: () => Promise<void>) => {
    const origin = c.req.header('Origin');
    // No Origin = not a browser cross-site request (curl, same-origin GET).
    if (origin && origin !== new URL(c.req.url).origin && !opts.allowOrigin(origin)) {
      return c.json({ error: 'Origin not allowed' }, 403);
    }
    await next();
  };
}

function isJson(contentType: string | undefined): boolean {
  return (contentType ?? '').split(';')[0].trim().toLowerCase() === 'application/json';
}

/** The revision a PUT claims to replace, from If-Match / If-None-Match. */
function expectedRev(c: Context): ExpectedRev | 'missing' {
  const ifMatch = c.req.header('If-Match');
  if (ifMatch !== undefined) {
    const rev = Number(ifMatch.replace(/^W\//, '').replace(/"/g, '').trim());
    // An unparseable tag can never match a real revision — treat it as a stale one.
    return Number.isInteger(rev) && rev > 0 ? rev : -1;
  }
  if (c.req.header('If-None-Match')?.trim() === '*') return null;
  return 'missing';
}

async function readBody(c: Context, maxBytes: number): Promise<string | 'too-large' | 'bad-encoding'> {
  const declared = Number(c.req.header('Content-Length') ?? NaN);
  if (declared > maxBytes) return 'too-large';
  const raw = Buffer.from(await c.req.arrayBuffer());
  if (raw.byteLength > maxBytes) return 'too-large';

  const encoding = (c.req.header('Content-Encoding') ?? 'identity').trim().toLowerCase();
  if (encoding === 'identity') return raw.toString('utf8');
  if (encoding !== 'deflate') return 'bad-encoding';
  try {
    // Bounded, so a small compressed body can't inflate into an unbounded one.
    return inflateSync(raw, { maxOutputLength: maxBytes }).toString('utf8');
  } catch (err) {
    return err instanceof RangeError ? 'too-large' : 'bad-encoding';
  }
}

/** The envelope, or a reason it isn't one. Only the outer shape is checked. */
function parseEnvelope(body: string): BackupEnvelope | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return 'Body is not JSON';
  }
  if (!isRecord(parsed)) return 'Body is not an object';
  if (parsed.format !== 'release-tracker-backup') return 'Not a release-tracker backup';
  if (!Number.isInteger(parsed.formatVersion) || (parsed.formatVersion as number) < 1) {
    return 'formatVersion must be a positive integer';
  }
  if (typeof parsed.savedAt !== 'string' || Number.isNaN(Date.parse(parsed.savedAt))) {
    return 'savedAt must be an ISO date-time';
  }
  if (!isRecord(parsed.state)) return 'state must be an object';
  if (parsed.prefs !== undefined && !isRecord(parsed.prefs)) return 'prefs must be an object';
  return parsed as unknown as BackupEnvelope;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
