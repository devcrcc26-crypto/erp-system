import type { ApprovalTierDecision } from '@/lib/api/approvals.types';

/**
 * Employee self-edit of HR requests: a request is editable only by its owner
 * while DRAFT (never submitted) or RETURNED (sent back by an approver).
 * Saving only stores the fields; a RETURNED request is resubmitted with the
 * separate Resubmit action on the request page. The backend enforces the
 * same rules (403 otherwise).
 */
export const EDITABLE_REQUEST_STATUSES = ['DRAFT', 'RETURNED'] as const;

export function isEditableRequestStatus(status: string | null | undefined): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

/** Edit button visibility: editable status and the current user owns it. */
export function canEditOwnRequest(
  status: string | null | undefined,
  ownerId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return (
    isEditableRequestStatus(status) &&
    Boolean(ownerId) &&
    Boolean(currentUserId) &&
    ownerId === currentUserId
  );
}

/** Resubmit (separate from Edit) is for the requester of a RETURNED request. */
export function canResubmitOwnRequest(
  status: string | null | undefined,
  requesterId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return (
    status === 'RETURNED' &&
    Boolean(requesterId) &&
    Boolean(currentUserId) &&
    requesterId === currentUserId
  );
}

/** Latest approver note that returned the request (newest tier first). */
export function findReturnNote(
  tiers:
    | ReadonlyArray<{ decision: ApprovalTierDecision; comment?: string | null }>
    | null
    | undefined,
): string | null {
  const returned = [...(tiers ?? [])]
    .reverse()
    .find((tier) => tier.decision === 'RETURNED');
  return returned?.comment?.trim() || null;
}

/**
 * Edit page for a request, by approval category. `sourceId` is the module
 * record; work from home has none (the approval request is the record).
 * Returns null for categories employees cannot edit here.
 */
export function editRequestHref(
  categoryCode: string | null | undefined,
  sourceId: string | null | undefined,
  approvalRequestId: string,
): string | null {
  if (categoryCode === 'WORK_FROM_HOME') {
    return `/approvals/edit/work-from-home/${approvalRequestId}`;
  }
  if (!sourceId) {
    return null;
  }
  switch (categoryCode) {
    case 'LEAVE_REQUEST':
      return `/hr/leave-requests/${sourceId}/edit`;
    case 'EXPENSE_CLAIM':
      return `/hr/expense-claims/${sourceId}/edit`;
    case 'OVERTIME_APPLICATION':
      // Overtime sheets are edited entry by entry on the sheet page.
      return `/hr/overtime/${sourceId}`;
    case 'PER_DIEM':
      return `/approvals/edit/per-diem/${sourceId}`;
    case 'FLIGHT_APPLICATION':
      return `/approvals/edit/flight-application/${sourceId}`;
    case 'BUSINESS_TRIP':
      return `/approvals/edit/business-trip/${sourceId}`;
    case 'VEHICLE_APPLICATION':
      return `/approvals/edit/vehicle-application/${sourceId}`;
    case 'EXIT_PERMIT':
      return `/approvals/edit/exit-permit/${sourceId}`;
    case 'MATERIAL_REQUISITION':
      return `/approvals/edit/material-requisition/${sourceId}`;
    default:
      return null;
  }
}

/** Categories with an employee edit page (see editRequestHref). */
export const EDITABLE_REQUEST_CATEGORIES: ReadonlySet<string> = new Set([
  'LEAVE_REQUEST',
  'EXPENSE_CLAIM',
  'OVERTIME_APPLICATION',
  'PER_DIEM',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
  'VEHICLE_APPLICATION',
  'EXIT_PERMIT',
  'MATERIAL_REQUISITION',
  'WORK_FROM_HOME',
]);
