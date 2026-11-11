'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { ScheduleSubtaskDisplayStatus } from '@/lib/utils/schedule-subtasks';

const SUBTASK_STATUS_VARIANTS: Record<
  ScheduleSubtaskDisplayStatus,
  StatusBadgeVariant
> = {
  OPEN: 'default',
  'IN REVIEW': 'info',
  APPROVED: 'success',
  LOCKED: 'warning',
  CLOSED: 'success',
};

export default function ScheduleSubtaskStatusBadge({
  status,
}: {
  status: ScheduleSubtaskDisplayStatus;
}): React.ReactNode {
  return (
    <StatusBadge
      label={status}
      variant={SUBTASK_STATUS_VARIANTS[status]}
    />
  );
}
