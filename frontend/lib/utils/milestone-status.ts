import type { MilestoneStatus } from '@/lib/api/project-management.types';

export const MILESTONE_STATUS_OPTIONS: Array<{
  value: MilestoneStatus;
  label: string;
}> = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'AT_RISK', label: 'At risk' },
  { value: 'DELAYED', label: 'Delayed' },
  { value: 'COMPLETED', label: 'Completed' },
];

/**
 * Returns a display label for a milestone status value.
 */
export function formatMilestoneStatus(
  status: MilestoneStatus | string | null | undefined,
): string {
  if (!status) {
    return '-';
  }
  const match = MILESTONE_STATUS_OPTIONS.find((option) => option.value === status);
  return match?.label ?? status;
}
