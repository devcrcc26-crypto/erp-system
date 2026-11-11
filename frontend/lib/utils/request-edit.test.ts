import { describe, expect, it } from 'vitest';
import {
  EDITABLE_REQUEST_CATEGORIES,
  canEditOwnRequest,
  canResubmitOwnRequest,
  editRequestHref,
  findReturnNote,
} from '@/lib/utils/request-edit';

describe('canEditOwnRequest', () => {
  it('allows the owner on DRAFT and RETURNED', () => {
    expect(canEditOwnRequest('DRAFT', 'u1', 'u1')).toBe(true);
    expect(canEditOwnRequest('RETURNED', 'u1', 'u1')).toBe(true);
  });

  it.each([
    'PENDING',
    'SUBMITTED',
    'IN_REVIEW',
    'APPROVED',
    'PROCESSING',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
  ])('hides edit for %s', (status) => {
    expect(canEditOwnRequest(status, 'u1', 'u1')).toBe(false);
  });

  it("hides edit on someone else's request or without a session", () => {
    expect(canEditOwnRequest('RETURNED', 'u1', 'u2')).toBe(false);
    expect(canEditOwnRequest('DRAFT', 'u1', undefined)).toBe(false);
    expect(canEditOwnRequest('DRAFT', null, null)).toBe(false);
  });
});

describe('canResubmitOwnRequest', () => {
  it('is only for the requester of a RETURNED request', () => {
    expect(canResubmitOwnRequest('RETURNED', 'u1', 'u1')).toBe(true);
    expect(canResubmitOwnRequest('RETURNED', 'u1', 'u2')).toBe(false);
    expect(canResubmitOwnRequest('DRAFT', 'u1', 'u1')).toBe(false);
    expect(canResubmitOwnRequest('SUBMITTED', 'u1', 'u1')).toBe(false);
    expect(canResubmitOwnRequest('CANCELLED', 'u1', 'u1')).toBe(false);
  });
});

describe('findReturnNote', () => {
  it('returns the newest RETURNED tier comment', () => {
    expect(
      findReturnNote([
        { decision: 'RETURNED', comment: 'old' },
        { decision: 'APPROVED', comment: 'ok' },
        { decision: 'RETURNED', comment: '  Attach the receipt  ' },
      ]),
    ).toBe('Attach the receipt');
  });

  it('returns null when no tier returned it or the note is blank', () => {
    expect(findReturnNote([{ decision: 'APPROVED', comment: 'ok' }])).toBeNull();
    expect(findReturnNote([{ decision: 'RETURNED', comment: '  ' }])).toBeNull();
    expect(findReturnNote(undefined)).toBeNull();
  });
});

describe('editRequestHref', () => {
  it('routes every editable category to an edit page', () => {
    for (const code of EDITABLE_REQUEST_CATEGORIES) {
      expect(editRequestHref(code, 'src-1', 'apr-1')).not.toBeNull();
    }
  });

  it('uses the approval id for work from home and source id elsewhere', () => {
    expect(editRequestHref('WORK_FROM_HOME', null, 'apr-1')).toBe(
      '/approvals/edit/work-from-home/apr-1',
    );
    expect(editRequestHref('PER_DIEM', 'src-1', 'apr-1')).toBe(
      '/approvals/edit/per-diem/src-1',
    );
  });

  it('returns null for unsupported categories or a missing source', () => {
    expect(editRequestHref('OFFICIAL_SEAL_USAGE', 'src-1', 'apr-1')).toBeNull();
    expect(editRequestHref('PER_DIEM', null, 'apr-1')).toBeNull();
  });
});
