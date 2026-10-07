// The backup's file store. Holds one opaque copy of the app's data on disk, plus a
// short history, behind a revision number.
//
// This module is deliberately ignorant: it never interprets the envelope beyond its
// outer shape, and it never imports the connector registry. The app owns the data;
// this only keeps a copy somewhere the browser can't wipe. Backup is not push — the
// only path to an external system is the app's push, through its review modal.
//
// Layout under `dir`:
//   current.json   the envelope exactly as the app sent it (readable, importable)
//   meta.json      { rev, savedAt, size } — the cheap answer to "how fresh is it?"
//   history/       previous copies, pruned on write
//
// Crash safety: every file is written to a temp name, fsynced, then renamed into
// place, so a reader only ever sees a whole file. current.json is written before
// meta.json; if the process dies between the two, the next start notices the size
// mismatch and re-derives meta from current.json with a bumped rev — which also
// invalidates any writer still holding the old one.

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { BackupMeta } from '../contract.js';

/** How many recent copies history keeps regardless of age. */
const KEEP_RECENT = 20;
/** How many days back history also keeps the newest copy of each day. */
const KEEP_DAILY_DAYS = 14;

export type WriteResult = { ok: true; meta: BackupMeta } | { ok: false; current: BackupMeta | null };

/** The revision a writer claims to be replacing: a number, or null for "nothing yet". */
export type ExpectedRev = number | null;

export class BackupStore {
  private readonly currentPath: string;
  private readonly metaPath: string;
  private readonly historyDir: string;
  /** Loaded lazily, then kept in step with every write — this process is the only writer. */
  private meta: BackupMeta | null | undefined;
  /** Serializes writes so two PUTs can't interleave their renames. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly dir: string) {
    this.currentPath = path.join(dir, 'current.json');
    this.metaPath = path.join(dir, 'meta.json');
    this.historyDir = path.join(dir, 'history');
  }

  /** The stored backup's meta, or null when there is none. */
  async getMeta(): Promise<BackupMeta | null> {
    if (this.meta === undefined) this.meta = await this.loadMeta();
    return this.meta;
  }

  /** The stored envelope's raw bytes plus its meta, or null when there is none. */
  async read(): Promise<{ meta: BackupMeta; body: string } | null> {
    const meta = await this.getMeta();
    if (!meta) return null;
    return { meta, body: await readFile(this.currentPath, 'utf8') };
  }

  /**
   * Replace the backup if `expected` names the current revision. `savedAt` is the
   * envelope's own stamp, already validated by the caller.
   */
  write(body: string, savedAt: string, expected: ExpectedRev): Promise<WriteResult> {
    const run = this.queue.then(() => this.writeNow(body, savedAt, expected));
    // Keep the chain alive past a failed write; the failure still reaches this caller.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async writeNow(body: string, savedAt: string, expected: ExpectedRev): Promise<WriteResult> {
    const current = await this.getMeta();
    if ((current?.rev ?? null) !== expected) return { ok: false, current };

    await mkdir(this.historyDir, { recursive: true });
    // Copy, not move: current.json exists at every instant, so a crash here loses nothing.
    if (current) await copyFile(this.currentPath, path.join(this.historyDir, historyName(current)));

    await writeAtomic(this.currentPath, body);
    const meta: BackupMeta = { rev: (current?.rev ?? 0) + 1, savedAt, size: Buffer.byteLength(body) };
    await writeAtomic(this.metaPath, JSON.stringify(meta));
    this.meta = meta;

    await this.prune();
    return { ok: true, meta };
  }

  private async loadMeta(): Promise<BackupMeta | null> {
    let size: number;
    try {
      size = (await stat(this.currentPath)).size;
    } catch {
      return null; // no backup yet
    }
    let meta: BackupMeta | null = null;
    try {
      meta = JSON.parse(await readFile(this.metaPath, 'utf8')) as BackupMeta;
    } catch {
      /* missing or torn — re-derive below */
    }
    if (meta && meta.size === size) return meta;

    // meta.json is missing or describes a different current.json (a crash between
    // the two renames, or a hand-copied restore). Trust the backup itself.
    const envelope = JSON.parse(await readFile(this.currentPath, 'utf8')) as { savedAt?: unknown };
    const derived: BackupMeta = {
      rev: (meta?.rev ?? 0) + 1,
      savedAt: typeof envelope.savedAt === 'string' ? envelope.savedAt : new Date(0).toISOString(),
      size,
    };
    await writeAtomic(this.metaPath, JSON.stringify(derived));
    return derived;
  }

  /** Keep the newest KEEP_RECENT copies, plus the newest copy of each of the last
   *  KEEP_DAILY_DAYS days. Names sort chronologically, so this needs no file reads. */
  private async prune(): Promise<void> {
    const names = (await readdir(this.historyDir)).filter((n) => n.endsWith('.json')).sort().reverse();
    const keep = new Set(names.slice(0, KEEP_RECENT));
    const cutoff = dayOf(new Date(Date.now() - KEEP_DAILY_DAYS * 86_400_000).toISOString());
    const daysSeen = new Set<string>();
    for (const name of names) {
      const day = name.slice(0, 10);
      if (day < cutoff || daysSeen.has(day)) continue;
      daysSeen.add(day);
      keep.add(name);
    }
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => rm(path.join(this.historyDir, n), { force: true })));
  }
}

/** `2026-10-07T14-03-11.402Z__r12.json` — sortable by time, and names its revision. */
function historyName(meta: BackupMeta): string {
  return `${meta.savedAt.replace(/:/g, '-')}__r${String(meta.rev).padStart(6, '0')}.json`;
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

async function writeAtomic(target: string, contents: string): Promise<void> {
  const tmp = `${target}.${randomUUID()}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(contents, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, target);
}
