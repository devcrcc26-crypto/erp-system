import { SealUrgency } from '@prisma/client';
import type { ImportColumnDef } from './import-column-schema';

/**
 * Column definitions shared by the two seal-usage imports. Official and
 * project seal requests carry identical fields, so they share one definition
 * and differ only in their wording.
 */
export function buildSealImportColumns(
  kind: 'official' | 'project',
): ImportColumnDef[] {
  const sealLabel = kind === 'official' ? 'official seal' : 'project seal';

  return [
    {
      field: 'employeeEmail',
      label: 'Employee Email',
      type: 'email',
      requiredGroup: 'employee',
      example: 'employee@company.local',
      notes: 'Preferred way to identify the requester.',
      width: 28,
    },
    {
      field: 'employeeId',
      label: 'Employee ID',
      type: 'string',
      requiredGroup: 'employee',
      notes: 'User UUID. Only needed when Employee Email is blank.',
      width: 36,
    },
    {
      field: 'fileName',
      label: 'Document Name',
      type: 'string',
      required: true,
      maxLength: 255,
      example:
        kind === 'official'
          ? 'Bank guarantee letter - Adama Phase 2'
          : 'Subcontract agreement - Adama Phase 2',
      notes: `Name of the document that needs the ${sealLabel}.`,
      aliases: ['fileName', 'documentName'],
      width: 34,
    },
    {
      field: 'description',
      label: 'Description',
      type: 'string',
      required: true,
      maxLength: 1000,
      example: `Why the ${sealLabel} is required and where the document goes.`,
      width: 40,
    },
    {
      field: 'sealCategory',
      label: 'Seal Category',
      type: 'string',
      maxLength: 200,
      example: 'Contract',
      notes: 'Free text or one of the preset categories used in the form.',
      width: 20,
    },
    {
      field: 'copyCount',
      label: 'Copy Count',
      type: 'integer',
      min: 1,
      example: '2',
      notes: 'Number of copies to be sealed.',
      width: 14,
    },
    {
      field: 'urgency',
      label: 'Urgency',
      type: 'enum',
      required: true,
      enumValues: [
        SealUrgency.CRITICAL,
        SealUrgency.URGENT,
        SealUrgency.MEDIUM,
        SealUrgency.MINOR,
      ],
      example: 'Medium',
      width: 14,
    },
    {
      field: 'dateNeeded',
      label: 'Date Needed',
      type: 'date',
      required: true,
      example: '2026-09-15',
      width: 16,
    },
  ];
}
