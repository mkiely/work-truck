// execa wrapper for CLI-backed connectors. Runs a command, reads its stdout, parses
// JSON. No shell is used (args are passed as an array), so there is no shell-injection
// surface. Credentials/env for the tool are injected here by the service, never
// supplied by the app.

import { execa } from 'execa';

export interface RunOpts {
  /** Working directory for the command. */
  cwd?: string;
  /** Hard timeout; the process is killed if it exceeds this. Default 60s. */
  timeoutMs?: number;
  /** Extra env vars merged onto process.env (e.g. tokens). */
  env?: Record<string, string>;
}

/**
 * Run `bin` with `args` and parse its stdout as JSON. Throws a descriptive error on
 * non-zero exit, timeout, or unparseable output.
 */
export async function runJson<T>(bin: string, args: string[], opts: RunOpts = {}): Promise<T> {
  let stdout: string;
  try {
    const res = await execa(bin, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 60_000,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
    });
    stdout = res.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`CLI '${bin}' failed: ${msg}`);
  }

  try {
    return JSON.parse(stdout) as T;
  } catch {
    const preview = stdout.length > 200 ? `${stdout.slice(0, 200)}…` : stdout;
    throw new Error(`CLI '${bin}' did not return valid JSON. Got: ${preview}`);
  }
}
