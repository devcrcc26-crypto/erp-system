/**
 * Comma-separated status filters for Active/Closed list tabs.
 */
export const ISSUE_OPEN_STATUSES = 'OPEN,IN_PROGRESS';
export const ISSUE_RESOLVED_STATUSES = 'CLOSED';

export const RFI_OPEN_STATUSES = 'DRAFT,SUBMITTED,UNDER_REVIEW,ANSWERED';
export const RFI_RESOLVED_STATUSES = 'CLOSED';

export const CHANGE_REQUEST_ACTIVE_STATUSES = 'DRAFT,SUBMITTED';
export const CHANGE_REQUEST_RESOLVED_STATUSES = 'APPROVED,REJECTED,CLOSED';

/** External release table statuses: In Progress → Site/Consultant review → Issued (SUBMITTED). */
export const EXTERNAL_RELEASE_DRAFT_STATUSES =
  'DRAFT,UNDER_SITE_REVIEW,SITE_APPROVED,PENDING_CONSULTANT_REVIEW,CONSULTANT_REVIEWED';
export const EXTERNAL_RELEASE_ISSUED_STATUSES = 'SUBMITTED';
export const EXTERNAL_RELEASE_WITHDRAWN_STATUSES = 'WITHDRAWN';

export const CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES =
  'DRAFT,SUBMITTED,UNDER_REVIEW,REVISE_AND_RESUBMIT';
export const CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES =
  'APPROVED,APPROVED_WITH_COMMENTS,REJECTED';

export const PROJECT_ACTIVE_STATUSES = 'NOT_STARTED,IN_PROGRESS,ON_HOLD';
export const PROJECT_CLOSED_STATUSES = 'COMPLETED,CANCELLED';

export const RISK_OPEN_STATUSES = 'OPEN,MITIGATED,ACCEPTED';
export const RISK_RESOLVED_STATUSES = 'CLOSED';

export const CORRESPONDENCE_ACTIVE_STATUSES = 'DRAFT,SENT,ACKNOWLEDGED';
export const CORRESPONDENCE_CLOSED_STATUSES = 'CLOSED';

export const PUNCH_OPEN_STATUSES = 'RAISED,ASSIGNED,CORRECTED';
export const PUNCH_VERIFIED_STATUSES = 'VERIFIED';
export const PUNCH_CLOSED_STATUSES = 'CLOSED';

/**
 * Resolves the API status param: a single Select value overrides the tab set.
 */
export function resolveTabStatusFilter(
  tabStatuses: string,
  statusFilter: string | undefined,
): string {
  return statusFilter?.trim() || tabStatuses;
}

/**
 * Builds Status Select options from the same status set the active tab uses.
 * Labels come from the table's formatter / workflow - not a parallel list.
 */
export function buildTabStatusFilterOptions<T extends string>(
  tabStatuses: string,
  formatLabel: (status: T) => string,
): Array<{ value: T; label: string }> {
  return tabStatuses
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => value.length > 0)
    .map((value) => ({
      value,
      label: formatLabel(value),
    }));
}
