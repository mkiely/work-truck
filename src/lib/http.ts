// Small fetch + Basic-auth helper for HTTP-backed connectors (e.g. backends using
// `email:apiToken` Basic auth). Credentials are read from the service's own env
// and never come from the app. No connector uses it yet — kept as the building
// block for the first live HTTP backend.

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
