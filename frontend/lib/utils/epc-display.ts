import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  CommentSeverity,
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  EdvStatus,
  TaskDisciplineProjectedStatus,
} from '@/lib/api/epc.types';

export const EDV_STATUS_VARIANTS: Record<EdvStatus, StatusBadgeVariant> = {
  DRAFT: 'default',
  IN_REVIEW: 'info',
  APPROVED: 'success',
  LOCKED: 'warning',
  SUPERSEDED: 'default',
};

export const PROJECTED_STATUS_VARIANTS: Record<
  DesignPackageProjectedStatus | TaskDisciplineProjectedStatus,
  StatusBadgeVariant
> = {
  IN_PROGRESS: 'info',
  PENDING_LEAD: 'orange',
  APPROVED: 'success',
  REWORK_REQUIRED: 'error',
  LOCKED: 'warning',
};

export const PROJECTED_STATUS_LABELS: Record<
  DesignPackageProjectedStatus | TaskDisciplineProjectedStatus,
  string
> = {
  IN_PROGRESS: 'In Progress',
  PENDING_LEAD: 'Pending Lead',
  APPROVED: 'Approved',
  REWORK_REQUIRED: 'Rework Required',
  LOCKED: 'Locked',
};

export const PACKAGE_STATUS_VARIANTS: Record<DesignPackageStatus, StatusBadgeVariant> =
  {
    OPEN: 'default',
    SUBMITTED: 'info',
    CLOSED: 'success',
  };

export const PACKAGE_STATUS_LABELS: Record<DesignPackageStatus, string> = {
  OPEN: 'Open',
  SUBMITTED: 'Submitted',
  CLOSED: 'Closed',
};

export const COMMENT_SEVERITY_VARIANTS: Record<CommentSeverity, StatusBadgeVariant> =
  {
    MINOR: 'default',
    MODERATE: 'warning',
    MAJOR: 'error',
  };

export const COMMENT_SEVERITY_LABELS: Record<CommentSeverity, string> = {
  MINOR: 'Minor',
  MODERATE: 'Moderate',
  MAJOR: 'Major',
};

export function formatEdvStatus(status: EdvStatus | string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    IN_REVIEW: 'In Review',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    SUPERSEDED: 'Superseded',
  };
  return labels[status] ?? status;
}

export function formatProjectedStatus(
  status: DesignPackageProjectedStatus | TaskDisciplineProjectedStatus | string,
): string {
  return (
    PROJECTED_STATUS_LABELS[status as DesignPackageProjectedStatus] ??
    status.replace(/_/g, ' ')
  );
}
