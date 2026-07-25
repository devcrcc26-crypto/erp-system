/**
 * Comma-separated status filters for Active/Closed list tabs.
 */
export const ISSUE_OPEN_STATUSES = 'OPEN,IN_PROGRESS';
export const ISSUE_RESOLVED_STATUSES = 'CLOSED';

export const RFI_OPEN_STATUSES = 'DRAFT,SUBMITTED,UNDER_REVIEW,ANSWERED';
export const RFI_RESOLVED_STATUSES = 'CLOSED';

export const CHANGE_REQUEST_ACTIVE_STATUSES = 'DRAFT,SUBMITTED';
export const CHANGE_REQUEST_RESOLVED_STATUSES = 'APPROVED,REJECTED,CLOSED';

export const EXTERNAL_RELEASE_DRAFT_STATUSES = 'DRAFT';
export const EXTERNAL_RELEASE_ISSUED_STATUSES =
  'SUBMITTED,UNDER_REVIEW,APPROVED,APPROVED_WITH_COMMENTS,REVISE_AND_RESUBMIT,REJECTED';

export const CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES =
  'DRAFT,SUBMITTED,UNDER_REVIEW,REVISE_AND_RESUBMIT';
export const CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES =
  'APPROVED,APPROVED_WITH_COMMENTS,REJECTED';

export const PROJECT_ACTIVE_STATUSES = 'NOT_STARTED,IN_PROGRESS,ON_HOLD';
export const PROJECT_CLOSED_STATUSES = 'COMPLETED,CANCELLED';

/**
 * Resolves the API status param: a single Select value overrides the tab set.
 */
export function resolveTabStatusFilter(
  tabStatuses: string,
  statusFilter: string | undefined,
): string {
  return statusFilter?.trim() || tabStatuses;
}
