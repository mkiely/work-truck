// Acme's work-item type catalog, declared as DATA (kind/role/target + access), not as
// UI. Each field is listed once: `creatable` shows it on the consumer's create form,
// `writeable` makes it pushable on an existing item. The consumer derives the create
// form, push capability, and edit lock-state from this single source
// (see release-tracker/src/lib/connectorFields.ts).
//
// Acme keeps points + sprint writeable (to exercise push) and the identity/ref fields
// create-once. The `id`s here are what AcmeTicket.typeId references (fixtures.ts).

import type { ConnectorItemType, FieldSpec, StatusDef } from '../../contract.js';

// Acme's status vocabulary: the native workflow states its tickets actually move
// through, each mapped onto a canonical category. Note two states share Under
// Review — exactly the information the bare categories used to flatten away.
// `id`s are the raw AcmeTicket.state strings.
export const ACME_STATUSES: StatusDef[] = [
  { id: 'todo', label: 'To Do', category: 'Not Started' },
  { id: 'in_progress', label: 'Doing', category: 'In Progress' },
  { id: 'in_review', label: 'In Review', category: 'Under Review' },
  { id: 'qa', label: 'QA Verify', category: 'Under Review' },
  { id: 'blocked', label: 'Impeded', category: 'Blocked' },
  { id: 'done', label: 'Done', category: 'Complete' },
];

// The writeable status field every Acme type carries (status transitions push back).
const STATUS_FIELD = { key: 'status', label: 'Status', kind: 'enum', enumRef: 'status', writeable: true } as const;

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
      STATUS_FIELD,
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
      STATUS_FIELD,
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
      STATUS_FIELD,
      // Vocabulary field (no role/ref): required at creation, round-trips via
      // attributes (filterAttributes in mapping.ts), and — being writeable —
      // accepts pushed updates through PushItemChange.fields.attributes.
      // `filterable` surfaces it as a filter facet in the consumer's item views.
      {
        key: 'severity',
        label: 'Severity',
        kind: 'enum',
        required: true,
        creatable: true,
        writeable: true,
        filterable: true,
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

// Acme's work-stream field catalog: describes the keys mapAcme emits in
// MappedWorkStream.attributes, exactly as itemTypes[].fields describes item
// attributes. Flat — streams have no type dimension. Vocabulary-shaped only
// (no role/ref/enumRef), read-only (no creatable/writeable). `filterable`
// makes `track` a stream-level facet in the consumer's release overview.
export const ACME_STREAM_FIELDS: FieldSpec[] = [
  {
    key: 'track',
    label: 'Track',
    kind: 'enum',
    filterable: true,
    options: [
      { value: 'product', label: 'Product' },
      { value: 'platform', label: 'Platform' },
    ],
  },
];

/** Display label for an Acme item-type id; falls back to the id, then 'Task'. */
export function acmeTypeLabel(typeId: string | null | undefined): string {
  return ACME_ITEM_TYPES.find((t) => t.id === typeId)?.label ?? 'Task';
}
