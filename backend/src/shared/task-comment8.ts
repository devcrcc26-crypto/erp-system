import { ApprovalLevel, TaskAttributes, UrgencyLevel } from '@prisma/client';

/**
 * Task attribute region/combination — keys must match Prisma enum.
 */
export const TASK_ATTRIBUTES_VALUES = [
  'ETHIOPIA',
  'CHINA',
  'COMBINE1',
  'COMBINE2',
] as const;

export type TaskAttributesValue = (typeof TASK_ATTRIBUTES_VALUES)[number];

export interface TaskAttributesDefinition {
  value: TaskAttributesValue;
  label: string;
}

export const TASK_ATTRIBUTES_DEFINITIONS: readonly TaskAttributesDefinition[] = [
  { value: 'ETHIOPIA', label: 'Ethiopia' },
  { value: 'CHINA', label: 'China' },
  { value: 'COMBINE1', label: 'Combine 1' },
  { value: 'COMBINE2', label: 'Combine 2' },
] as const;

const TASK_ATTRIBUTES_LABELS: Record<TaskAttributes, string> =
  TASK_ATTRIBUTES_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<TaskAttributes, string>,
  );

/** Human-readable label for a task attributes key. */
export function formatTaskAttributesLabel(
  value: TaskAttributes | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return TASK_ATTRIBUTES_LABELS[value] ?? value;
}

export const TASK_ATTRIBUTES_OPTIONS = TASK_ATTRIBUTES_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);

export const URGENCY_LEVEL_DEFINITIONS = [
  { value: 'NORMAL' as const, label: 'Normal' },
  { value: 'URGENT' as const, label: 'Urgent' },
  { value: 'CRITICAL' as const, label: 'Critical' },
  { value: 'VERY_URGENT' as const, label: 'Very Urgent' },
] as const;

const URGENCY_LEVEL_LABELS: Record<UrgencyLevel, string> =
  URGENCY_LEVEL_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<UrgencyLevel, string>,
  );

/** Human-readable label for a task urgency level. */
export function formatUrgencyLevelLabel(
  value: UrgencyLevel | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return URGENCY_LEVEL_LABELS[value] ?? value;
}

export const URGENCY_LEVEL_OPTIONS = URGENCY_LEVEL_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);

export const APPROVAL_LEVEL_DEFINITIONS = [
  { value: 'DEPARTMENT' as const, label: 'Department' },
  { value: 'INSTITUTE' as const, label: 'Institute' },
] as const;

const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> =
  APPROVAL_LEVEL_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.value] = definition.label;
      return accumulator;
    },
    {} as Record<ApprovalLevel, string>,
  );

/** Human-readable label for a task approval level. */
export function formatApprovalLevelLabel(
  value: ApprovalLevel | null | undefined,
): string {
  if (value == null) {
    return '';
  }
  return APPROVAL_LEVEL_LABELS[value] ?? value;
}

export const APPROVAL_LEVEL_OPTIONS = APPROVAL_LEVEL_DEFINITIONS.map(
  (definition) => ({
    value: definition.value,
    label: definition.label,
  }),
);

export const ARCHIVING_LABELS = {
  required: 'Required',
  notRequired: 'Not Required',
} as const;

/** Human-readable label for task archiving requirement. */
export function formatArchivingLabel(
  requiresArchiving: boolean | null | undefined,
): string {
  if (requiresArchiving == null) {
    return '';
  }
  return requiresArchiving
    ? ARCHIVING_LABELS.required
    : ARCHIVING_LABELS.notRequired;
}
