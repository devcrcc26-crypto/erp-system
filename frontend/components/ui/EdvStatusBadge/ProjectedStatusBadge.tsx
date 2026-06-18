'use client';

import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type {
  DesignPackageProjectedStatus,
  TaskDisciplineProjectedStatus,
} from '@/lib/api/epc.types';
import {
  formatProjectedStatus,
  PROJECTED_STATUS_VARIANTS,
} from '@/lib/utils/epc-display';

export default function ProjectedStatusBadge({
  status,
  pending,
}: {
  status: DesignPackageProjectedStatus | TaskDisciplineProjectedStatus | string;
  pending?: boolean;
}): React.ReactNode {
  const normalized = status as DesignPackageProjectedStatus;
  const variant = PROJECTED_STATUS_VARIANTS[normalized] ?? 'default';
  const label = pending
    ? `${formatProjectedStatus(status)} (updating…)`
    : formatProjectedStatus(status);

  return <StatusBadge label={label} variant={variant} />;
}
