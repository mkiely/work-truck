// Acme's work-item type catalog, declared as DATA (kind/role/target + access), not as
// UI. Each field is listed once: `creatable` shows it on the consumer's create form,
// `writeable` makes it pushable on an existing item. The consumer derives the create
// form, push capability, and edit lock-state from this single source
// (see release-tracker/src/lib/connectorFields.ts).
//
// Acme keeps points + sprint writeable (to exercise push) and the identity/ref fields
// create-once. The `id`s here are what AcmeTicket.typeId references (fixtures.ts).

import type { ConnectorItemType } from '../../contract.js';

export const ACME_ITEM_TYPES: ConnectorItemType[] = [
  {
    id: 'acme_story',
    label: 'Story',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'description', label: 'Description', kind: 'string', role: 'description', multiline: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Module', kind: 'ref', target: 'workStream', required: true, creatable: true, writeable: false },
      { key: 'sprint', label: 'Cycle', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'assignee', label: 'Assignee', kind: 'ref', target: 'member', creatable: true, writeable: false },
      { key: 'points', label: 'Estimate', kind: 'number', role: 'points', creatable: true, writeable: true },
    ],
  },
  {
    id: 'acme_task',
    label: 'Task',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Module', kind: 'ref', target: 'workStream', creatable: true, writeable: false },
      { key: 'sprint', label: 'Cycle', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'assignee', label: 'Assignee', kind: 'ref', target: 'member', creatable: true, writeable: false },
      { key: 'points', label: 'Estimate', kind: 'number', role: 'points', creatable: true, writeable: true },
    ],
  },
  {
    id: 'acme_bug',
    label: 'Bug',
    fields: [
      { key: 'subject', label: 'Summary', kind: 'string', role: 'subject', required: true, creatable: true, writeable: false },
      { key: 'description', label: 'Steps to reproduce', kind: 'string', role: 'description', multiline: true, creatable: true, writeable: false },
      { key: 'workStream', label: 'Module', kind: 'ref', target: 'workStream', required: true, creatable: true, writeable: false },
      { key: 'sprint', label: 'Cycle', kind: 'ref', target: 'sprint', creatable: true, writeable: true },
      { key: 'assignee', label: 'Assignee', kind: 'ref', target: 'member', creatable: true, writeable: false },
      { key: 'points', label: 'Estimate', kind: 'number', role: 'points', creatable: true, writeable: true },
      // Vocabulary field (no role/ref): required at creation, round-trips via
      // attributes (filterAttributes in mapping.ts), read-only in the consumer
      // until the contract generalizes attribute write-back.
      {
        key: 'severity',
        label: 'Severity',
        kind: 'enum',
        required: true,
        creatable: true,
        writeable: false,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' },
        ],
      },
    ],
  },
];

/** Display label for an Acme item-type id; falls back to the id, then 'Task'. */
export function acmeTypeLabel(typeId: string | null | undefined): string {
  return ACME_ITEM_TYPES.find((t) => t.id === typeId)?.label ?? 'Task';
}
