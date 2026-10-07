// The backup store and its routes. Every test gets its own temp directory, so
// nothing here touches ~/.work-truck.

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';
import type { Connector } from '../connectors/types.js';
import type { BackupConflict, BackupMeta } from '../contract.js';
import { BackupStore } from './store.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'work-truck-backup-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

function envelope(savedAt = '2026-10-07T12:00:00.000Z', extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'release-tracker-backup',
    formatVersion: 1,
    savedAt,
    schemaVersion: 31,
    state: { version: 31, releases: [] },
    prefs: { 'release-tracker:theme': 'dusk' },
    ...extra,
  });
}

describe('BackupStore', () => {
  it('has no meta before the first write', async () => {
    expect(await new BackupStore(dir).getMeta()).toBeNull();
  });

  it('stores the body verbatim and starts at rev 1', async () => {
    const store = new BackupStore(dir);
    const body = envelope();
    const res = await store.write(body, '2026-10-07T12:00:00.000Z', null);
    expect(res).toEqual({ ok: true, meta: { rev: 1, savedAt: '2026-10-07T12:00:00.000Z', size: Buffer.byteLength(body) } });
    expect(await readFile(path.join(dir, 'current.json'), 'utf8')).toBe(body);
  });

  it('refuses a write naming a stale revision', async () => {
    const store = new BackupStore(dir);
    await store.write(envelope(), '2026-10-07T12:00:00.000Z', null);
    const stale = await store.write(envelope(), '2026-10-07T12:00:01.000Z', null);
    expect(stale).toMatchObject({ ok: false, current: { rev: 1 } });
    const wrong = await store.write(envelope(), '2026-10-07T12:00:01.000Z', 7);
    expect(wrong.ok).toBe(false);
  });

  it('copies the previous backup into history before replacing it', async () => {
    const store = new BackupStore(dir);
    const first = envelope('2026-10-07T12:00:00.000Z');
    await store.write(first, '2026-10-07T12:00:00.000Z', null);
    await store.write(envelope('2026-10-07T12:00:05.000Z'), '2026-10-07T12:00:05.000Z', 1);
    const history = await readdir(path.join(dir, 'history'));
    expect(history).toEqual(['2026-10-07T12-00-00.000Z__r000001.json']);
    expect(await readFile(path.join(dir, 'history', history[0]), 'utf8')).toBe(first);
  });

  it('serializes concurrent writes so exactly one of two racing writers wins', async () => {
    const store = new BackupStore(dir);
    await store.write(envelope(), '2026-10-07T12:00:00.000Z', null);
    const [a, b] = await Promise.all([
      store.write(envelope(), '2026-10-07T12:00:01.000Z', 1),
      store.write(envelope(), '2026-10-07T12:00:02.000Z', 1),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it('re-derives meta when meta.json no longer describes current.json, bumping rev', async () => {
    // A crash between writing current.json and meta.json, or a hand-copied restore.
    const first = new BackupStore(dir);
    await first.write(envelope(), '2026-10-07T12:00:00.000Z', null);
    const replaced = envelope('2026-09-01T00:00:00.000Z', { note: 'copied back by hand' });
    await writeFile(path.join(dir, 'current.json'), replaced);

    const meta = await new BackupStore(dir).getMeta();
    // rev 2, so a writer still holding rev 1 is refused rather than overwriting it.
    expect(meta).toEqual({ rev: 2, savedAt: '2026-09-01T00:00:00.000Z', size: Buffer.byteLength(replaced) });
  });

  it('prunes history to the recent copies plus one per day for the last two weeks', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-07T18:00:00.000Z'), toFake: ['Date'] });
    const store = new BackupStore(dir);
    const stamps = [
      '2026-08-01T09:00:00.000Z', // over two weeks old: pruned
      '2026-10-01T09:00:00.000Z', // older days inside the window: one each survives
      '2026-10-02T09:00:00.000Z',
      '2026-10-02T10:00:00.000Z',
      ...Array.from({ length: 22 }, (_, i) => `2026-10-07T12:${String(i).padStart(2, '0')}:00.000Z`),
    ];
    let rev: number | null = null;
    for (const s of stamps) {
      const res = await store.write(envelope(s), s, rev);
      if (!res.ok) throw new Error('unexpected conflict');
      rev = res.meta.rev;
    }
    const history = (await readdir(path.join(dir, 'history'))).sort();
    // 25 copies were rotated in. Kept: the 20 newest (all from today) + the newest
    // of Oct 2 + Oct 1. Gone: Aug 1, the earlier Oct 2, and today's 21st-newest.
    expect(history).toHaveLength(22);
    expect(history.some((n) => n.startsWith('2026-08-01'))).toBe(false);
    expect(history.filter((n) => n.startsWith('2026-10-02'))).toEqual(['2026-10-02T10-00-00.000Z__r000004.json']);
    expect(history.filter((n) => n.startsWith('2026-10-01'))).toHaveLength(1);
  });
});

describe('backup routes', () => {
  // A connector whose every method is a spy: backup must never reach any of them.
  const spyConnector = (): Connector => ({
    meta: { type: 'spy', label: 'Spy', configFields: [] },
    validate: vi.fn(async () => ({ ok: true })),
    fetchAndMap: vi.fn(async () => ({ workStreams: [], sprints: [], items: [] })),
    push: vi.fn(async () => ({ pushed: 0, failed: 0, errors: [] })),
    createItem: vi.fn(async () => {
      throw new Error('never');
    }),
  });

  const json = { 'Content-Type': 'application/json' };
  const put = (app: ReturnType<typeof createApp>, body: string | Uint8Array, headers: Record<string, string>) =>
    app.request('/backup', { method: 'PUT', body, headers });

  it('404s on meta and body before anything is stored', async () => {
    const app = createApp({ backup: { dir } });
    expect((await app.request('/backup/meta')).status).toBe(404);
    expect((await app.request('/backup')).status).toBe(404);
  });

  it('round-trips: first write, meta, then the exact bytes back', async () => {
    const app = createApp({ backup: { dir } });
    const body = envelope();
    const res = await put(app, body, { ...json, 'If-None-Match': '*' });
    expect(res.status).toBe(200);
    const meta = (await res.json()) as BackupMeta;
    expect(meta.rev).toBe(1);

    expect(await (await app.request('/backup/meta')).json()).toEqual(meta);
    const got = await app.request('/backup');
    expect(got.headers.get('ETag')).toBe('"1"');
    expect(await got.text()).toBe(body);
  });

  it('replaces with If-Match and refuses a stale revision with the current meta', async () => {
    const app = createApp({ backup: { dir } });
    await put(app, envelope(), { ...json, 'If-None-Match': '*' });
    expect((await put(app, envelope(), { ...json, 'If-Match': '"1"' })).status).toBe(200);

    const stale = await put(app, envelope(), { ...json, 'If-Match': '"1"' });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as BackupConflict).current?.rev).toBe(2);

    // A "first write" when one already exists is a conflict too.
    expect((await put(app, envelope(), { ...json, 'If-None-Match': '*' })).status).toBe(409);
  });

  it('requires a precondition', async () => {
    const app = createApp({ backup: { dir } });
    expect((await put(app, envelope(), json)).status).toBe(428);
  });

  it('requires application/json, which forces a browser preflight', async () => {
    const app = createApp({ backup: { dir } });
    const res = await put(app, envelope(), { 'Content-Type': 'text/plain', 'If-None-Match': '*' });
    expect(res.status).toBe(415);
  });

  it('rejects a body that is not a backup envelope', async () => {
    const app = createApp({ backup: { dir } });
    const h = { ...json, 'If-None-Match': '*' };
    expect((await put(app, 'not json', h)).status).toBe(400);
    expect((await put(app, JSON.stringify({ hello: 'world' }), h)).status).toBe(400);
    expect((await put(app, envelope('yesterday'), h)).status).toBe(400);
    expect((await put(app, envelope(undefined, { state: [] }), h)).status).toBe(400);
    expect(await new BackupStore(dir).getMeta()).toBeNull();
  });

  it('accepts a deflate-compressed body and stores it decompressed', async () => {
    const app = createApp({ backup: { dir } });
    const body = envelope();
    const res = await put(app, deflateSync(body), { ...json, 'Content-Encoding': 'deflate', 'If-None-Match': '*' });
    expect(res.status).toBe(200);
    expect(await (await app.request('/backup')).text()).toBe(body);
  });

  it('refuses a body over the size limit, compressed or inflated', async () => {
    const app = createApp({ backup: { dir, maxBytes: 2_000 } });
    const big = envelope(undefined, { padding: 'x'.repeat(5_000) });
    const h = { ...json, 'If-None-Match': '*' };
    expect((await put(app, big, h)).status).toBe(413);
    // Compresses far below the limit, but inflates past it.
    expect((await put(app, deflateSync(big), { ...h, 'Content-Encoding': 'deflate' })).status).toBe(413);
  });

  it('refuses a disallowed Origin and admits localhost and its own', async () => {
    const app = createApp({ backup: { dir } });
    const evil = await app.request('/backup/meta', { headers: { Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const write = await put(app, envelope(), { ...json, 'If-None-Match': '*', Origin: 'https://evil.example' });
    expect(write.status).toBe(403);
    expect(await new BackupStore(dir).getMeta()).toBeNull();

    expect((await app.request('/backup/meta', { headers: { Origin: 'http://localhost:5173' } })).status).toBe(404);
    expect((await app.request('http://localhost:8787/backup/meta', { headers: { Origin: 'http://localhost:8787' } })).status).toBe(404);
  });

  it('is absent when turned off', async () => {
    const app = createApp({ backup: false });
    expect((await app.request('/backup/meta')).status).toBe(404);
    // Even with the SPA fallback serving index.html for unknown GETs.
    expect((await app.request('/backup')).status).toBe(404);
    const res = await put(app, envelope(), { ...json, 'If-None-Match': '*' });
    expect(res.status).toBe(404);
  });

  it('never calls a connector — backup is not push', async () => {
    const conn = spyConnector();
    const app = createApp({ backup: { dir }, connectors: [conn] });
    await put(app, envelope(), { ...json, 'If-None-Match': '*' });
    await put(app, envelope(), { ...json, 'If-Match': '"1"' });
    await app.request('/backup/meta');
    await app.request('/backup');
    expect(conn.validate).not.toHaveBeenCalled();
    expect(conn.fetchAndMap).not.toHaveBeenCalled();
    expect(conn.push).not.toHaveBeenCalled();
    expect(conn.createItem).not.toHaveBeenCalled();
  });

  it('cannot reach a connector: the module imports neither the registry nor any connector', async () => {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const sources = (await readdir(here)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const src = await readFile(path.join(here, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"][^'"]*(registry|connectors)[^'"]*['"]/);
    }
  });
});
