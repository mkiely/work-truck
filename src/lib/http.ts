// Small fetch + Basic-auth helper for HTTP-backed connectors (Atlassian Cloud uses
// `email:apiToken` Basic auth). STUB for now — the JIRA connector runs on fixtures
// until step 4 (live JIRA Cloud). Credentials are read from the service's own env
// here and never come from the app.

export interface BasicAuth {
  email: string;
  apiToken: string;
}

/** GET a JSON resource with optional Basic auth. Throws on non-2xx. */
export async function getJson<T>(url: string, auth?: BasicAuth): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (auth) {
    const token = Buffer.from(`${auth.email}:${auth.apiToken}`).toString('base64');
    headers.authorization = `Basic ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
