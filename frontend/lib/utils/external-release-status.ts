import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { formatSubmittalStatus } from '@/lib/utils/pm-status-display';

/** External releases are "Issued" rather than "Submitted" once sent out. */
export function formatExternalReleaseStatus(status: SubmittalStatus): string {
  if (status === 'SUBMITTED') {
    return 'Issued';
  }
  if (status === 'UNDER_SITE_REVIEW') {
    return 'Under Site Review';
  }
  if (status === 'SITE_APPROVED') {
    return 'Site Approved';
  }
  if (status === 'PENDING_CONSULTANT_REVIEW') {
    return 'Pending Consultant Review';
  }
  if (status === 'CONSULTANT_REVIEWED') {
    return 'Consultant Reviewed';
  }
  if (status === 'WITHDRAWN') {
    return 'Withdrawn';
  }
  return formatSubmittalStatus(status);
}
