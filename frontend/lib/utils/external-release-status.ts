import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { formatSubmittalStatus } from '@/lib/utils/pm-status-display';

/** External releases are "Issued" rather than "Submitted" once sent out. */
export function formatExternalReleaseStatus(status: SubmittalStatus): string {
  return status === 'SUBMITTED' ? 'Issued' : formatSubmittalStatus(status);
}
