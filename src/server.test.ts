// Host behavior: injected (out-of-tree) connectors are served alongside the
// built-ins, and a duplicate meta.type fails at registry build time.

import { describe, expect, it } from 'vitest';
import { buildRegistry } from './registry.js';
import { createApp } from './server.js';
import type { Connector } from './connectors/types.js';
import type { ConnectorMeta, MappedRelease } from './contract.js';

const emptyRelease: MappedRelease = { workStreams: [], sprints: [], items: [] };

function fakeConnector(type: string): Connector {
  return {
    meta: { type, label: 'Fake Backend', configFields: [] },
    validate: async () => ({ ok: true }),
    fetchAndMap: async () => emptyRelease,
  };
}

describe('buildRegistry', () => {
  it('combines built-ins with injected connectors', () => {
    const registry = buildRegistry([fakeConnector('fake')]);
    expect(registry['acme']).toBeTruthy();
    expect(registry['fake']).toBeTruthy();
  });

  it('throws on a duplicate meta.type', () => {
    expect(() => buildRegistry([fakeConnector('acme')])).toThrow(/Duplicate connector type "acme"/);
    expect(() => buildRegistry([fakeConnector('fake'), fakeConnector('fake')])).toThrow(/Duplicate connector type "fake"/);
  });
});

describe('createApp with injected connectors', () => {
  const app = createApp({ connectors: [fakeConnector('fake')] });

  it('GET /connectors advertises the injected connector alongside the built-ins', async () => {
    const res = await app.request('/connectors');
    expect(res.status).toBe(200);
    const metas = (await res.json()) as ConnectorMeta[];
    const types = metas.map((m) => m.type);
    expect(types).toContain('acme');
    expect(types).toContain('fake');
  });

  it('POST /releases/sync dispatches to the injected connector', async () => {
    const res = await app.request('/releases/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connector: { type: 'fake', config: {} } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(emptyRelease);
  });

  it('POST /releases/push on a connector without push returns a clean 400', async () => {
    const res = await app.request('/releases/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connector: { type: 'fake', config: {} }, changes: [] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Connector does not support push' });
  });

  it('default createApp() still serves only the built-ins', async () => {
    const res = await createApp().request('/connectors');
    const metas = (await res.json()) as ConnectorMeta[];
    expect(metas.map((m) => m.type)).toEqual(['acme']);
  });
});
