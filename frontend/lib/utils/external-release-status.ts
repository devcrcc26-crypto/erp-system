import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { formatSubmittalStatus } from '@/lib/utils/pm-status-display';

/** External releases are "Issued" rather than "Submitted" once sent out. */
export function formatExternalReleaseStatus(status: SubmittalStatus): string {
  return status === 'SUBMITTED' ? 'Issued' : formatSubmittalStatus(status);
}

export const EXTERNAL_RELEASE_DRAFT_STATUS_OPTIONS: Array<{
  value: SubmittalStatus;
  label: string;
}> = [{ value: 'DRAFT', label: 'Draft' }];

/** Issued releases may also carry site / consultant review outcomes. */
export const EXTERNAL_RELEASE_ISSUED_STATUS_OPTIONS: Array<{
  value: SubmittalStatus;
  label: string;
}> = [
  { value: 'SUBMITTED', label: 'Issued' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'APPROVED_WITH_COMMENTS', label: 'Approved with Comments' },
  { value: 'REVISE_AND_RESUBMIT', label: 'Revise and Resubmit' },
  { value: 'REJECTED', label: 'Rejected' },
];
