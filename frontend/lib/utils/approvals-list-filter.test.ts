import { describe, expect, it } from 'vitest';
import type { ApprovalRequestListItem } from '@/lib/api/approvals.types';
import { hideCancelledFromApprovers } from '@/lib/utils/approvals-list-filter';

function row(
  id: string,
  status: ApprovalRequestListItem['status'],
  requestedBy: string,
): ApprovalRequestListItem {
  return {
    id,
    companyId: 'c1',
    categoryId: 'cat',
    requestNumber: id,
    title: id,
    status,
    currentTier: 1,
    requestedBy,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };
}

const ROWS = [
  row('mine-cancelled', 'CANCELLED', 'me'),
  row('theirs-cancelled', 'CANCELLED', 'other'),
  row('theirs-pending', 'SUBMITTED', 'other'),
];

describe('hideCancelledFromApprovers', () => {
  it('never shows cancelled requests in Pending My Action', () => {
    const ids = hideCancelledFromApprovers(ROWS, {
      inbox: 'PENDING_MY_ACTION',
      currentUserId: 'me',
      isFullAccess: true,
    }).map((r) => r.id);
    expect(ids).toEqual(['theirs-pending']);
  });

  it('keeps the requester own cancelled requests in their history', () => {
    const ids = hideCancelledFromApprovers(ROWS, {
      inbox: 'MY_REQUESTS',
      currentUserId: 'me',
      isFullAccess: false,
    }).map((r) => r.id);
    expect(ids).toEqual(['mine-cancelled', 'theirs-pending']);
  });

  it('shows all cancelled requests to HR / admins in the full list', () => {
    expect(
      hideCancelledFromApprovers(ROWS, {
        inbox: 'ALL',
        currentUserId: 'me',
        isFullAccess: true,
      }),
    ).toHaveLength(3);
  });
});
