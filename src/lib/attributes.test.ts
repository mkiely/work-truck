import { describe, expect, it } from 'vitest';
import { filterAttributes, isAttributeField } from './attributes.js';
import type { ConnectorItemType } from '../contract.js';

const bug: ConnectorItemType = {
  id: 'bug',
  label: 'Bug',
  fields: [
    { key: 'subject', kind: 'string', role: 'subject', creatable: true },
    { key: 'sprint', kind: 'ref', target: 'sprint', writeable: true },
    { key: 'status', kind: 'enum', enumRef: 'status' },
    { key: 'severity', kind: 'enum', creatable: true, options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] },
    { key: 'regression', kind: 'boolean', creatable: true },
    { key: 'reproRate', kind: 'number', creatable: true },
    { key: 'foundIn', kind: 'string', creatable: true },
  ],
};

describe('isAttributeField', () => {
  it('vocabulary = no role, not a ref, not an app-canonical enum', () => {
    const verdicts = Object.fromEntries(bug.fields.map((f) => [f.key, isAttributeField(f)]));
    expect(verdicts).toEqual({
      subject: false, sprint: false, status: false,
      severity: true, regression: true, reproRate: true, foundIn: true,
    });
  });
});

describe('filterAttributes', () => {
  it('keeps only declared vocabulary keys', () => {
    const bag = filterAttributes(bug, { severity: 'high', subject: 'leak', rawBackendJunk: 'x' });
    expect(bag).toEqual({ severity: 'high' });
  });

  it('coerces values to the declared kind and drops uncoercible ones', () => {
    const bag = filterAttributes(bug, { reproRate: '3', regression: 'true', foundIn: 7, severity: 'not-an-option' });
    expect(bag).toEqual({ reproRate: 3, regression: true, foundIn: '7' });
  });

  it('passes explicit null through, drops undefined/empty', () => {
    expect(filterAttributes(bug, { severity: null, foundIn: '' })).toEqual({ severity: null });
  });

  it('returns undefined for an unknown type or an empty result', () => {
    expect(filterAttributes(undefined, { severity: 'high' })).toBeUndefined();
    expect(filterAttributes(bug, { rawBackendJunk: 'x' })).toBeUndefined();
  });
});
