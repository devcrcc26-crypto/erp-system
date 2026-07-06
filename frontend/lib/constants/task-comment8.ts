import type {
  ApprovalLevel,
  TaskAttributes,
  UrgencyLevel,
} from '@/lib/api/project-management.types';

export const TASK_ATTRIBUTES_OPTIONS: Array<{
  value: TaskAttributes;
  label: string;
}> = [
  { value: 'ETHIOPIA', label: 'Ethiopia' },
  { value: 'CHINA', label: 'China' },
  { value: 'COMBINE1', label: 'Combine 1' },
  { value: 'COMBINE2', label: 'Combine 2' },
];

export const URGENCY_LEVEL_OPTIONS: Array<{
  value: UrgencyLevel;
  label: string;
}> = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'VERY_URGENT', label: 'Very Urgent' },
  { value: 'CRITICAL', label: 'Critical' },
];

export const TASK_REVIEW_LEVEL_OPTIONS: Array<{
  value: ApprovalLevel;
  label: string;
}> = [
  { value: 'INSTITUTE', label: 'Design Institute Review' },
  { value: 'DEPARTMENT', label: 'Company Review' },
];

export const ARCHIVING_OPTIONS = [
  { value: true, label: 'Need' },
  { value: false, label: 'No need' },
] as const;

const TASK_ATTRIBUTES_LABELS: Record<TaskAttributes, string> = {
  ETHIOPIA: 'Ethiopia',
  CHINA: 'China',
  COMBINE1: 'Combine 1',
  COMBINE2: 'Combine 2',
};

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgent',
  VERY_URGENT: 'Very Urgent',
  CRITICAL: 'Critical',
};

const APPROVAL_LABELS: Record<ApprovalLevel, string> = {
  INSTITUTE: 'Design Institute Review',
  DEPARTMENT: 'Company Review',
};

/** Human-readable task attributes label. */
export function formatTaskAttributesLabel(
  value: TaskAttributes | string | null | undefined,
): string {
  if (!value) {
    return '-';
  }
  return TASK_ATTRIBUTES_LABELS[value as TaskAttributes] ?? value;
}

/** Human-readable urgency label. */
export function formatUrgencyLevelLabel(
  value: UrgencyLevel | null | undefined,
): string {
  if (!value) {
    return '-';
  }
  return URGENCY_LABELS[value] ?? value;
}

/** Human-readable task review level label. */
export function formatTaskReviewLevelLabel(
  value: ApprovalLevel | null | undefined,
): string {
  if (!value) {
    return '-';
  }
  return APPROVAL_LABELS[value] ?? value;
}

/** Human-readable archiving requirement label. */
export function formatArchivingLabel(
  requiresArchiving: boolean | null | undefined,
): string {
  if (requiresArchiving == null) {
    return '-';
  }
  return requiresArchiving ? 'Need' : 'No need';
}

/** Status badge variant for urgency levels. */
export function urgencyBadgeVariant(
  value: UrgencyLevel,
): 'default' | 'orange' | 'error' {
  if (value === 'VERY_URGENT' || value === 'CRITICAL') {
    return 'error';
  }
  if (value === 'URGENT') {
    return 'orange';
  }
  return 'default';
}
