// The backup module's entry point: where its files live and how big a backup may be.
// Self-contained on purpose — nothing here (or in ./store, ./routes) imports the
// connector registry, and a test holds that line.

import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { mountBackup } from './routes.js';
import { BackupStore } from './store.js';

export { BackupStore } from './store.js';

export interface BackupOptions {
  /** Where backups live. Defaults to $WORK_TRUCK_DATA_DIR/backup, else ~/.work-truck/backup. */
  dir?: string;
  /** Largest accepted backup in bytes. Defaults to $WORK_TRUCK_BACKUP_MAX_MB (25) MB. */
  maxBytes?: number;
}

export function defaultBackupDir(): string {
  const base = process.env.WORK_TRUCK_DATA_DIR || path.join(os.homedir(), '.work-truck');
  return path.join(base, 'backup');
}

/** Mount the backup routes. Returns the directory backups are written to. */
export function enableBackup(
  app: Hono,
  allowOrigin: (origin: string) => string | null,
  options: BackupOptions = {},
): string {
  const dir = options.dir ?? defaultBackupDir();
  const maxBytes = options.maxBytes ?? Number(process.env.WORK_TRUCK_BACKUP_MAX_MB || 25) * 1024 * 1024;
  mountBackup(app, new BackupStore(dir), { allowOrigin, maxBytes });
  return dir;
}
