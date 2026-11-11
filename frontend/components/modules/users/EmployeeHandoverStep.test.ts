import { describe, expect, it } from 'vitest';
import type { HandoverRequirements } from '@/lib/api/employment';
import {
  emptyHandoverState,
  handoverComplete,
  handoverItemCount,
  toHandoverPayload,
  type HandoverState,
} from './EmployeeHandoverStep';

const requirements: HandoverRequirements = {
  tiers: [{ tierId: 't1', requestId: 'r1', requestNumber: 'AR-1', title: 'Leave', tierLabel: 'Department Head' }],
  leadership: [{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', name: 'Finance' }],
  submittedRequests: [{ requestId: 'r9', requestNumber: 'AR-9', title: 'Overtime', status: 'PENDING' }],
};

describe('separation handover step', () => {
  it('counts every item to decide', () => {
    expect(handoverItemCount(requirements)).toBe(3);
  });

  it('confirm stays disabled until each item has a replacement, a real skip reason, or cancel/keep', () => {
    expect(handoverComplete(requirements, emptyHandoverState)).toBe(false);

    const partial: HandoverState = {
      tiers: { t1: { mode: 'skip', skipReason: 'ok' } },
      leadership: { 'DEPARTMENT_LEADER:dep-1': { mode: 'replace', replacementId: 'u2' } },
      submittedRequests: { r9: 'KEEP' },
    };
    expect(handoverComplete(requirements, partial)).toBe(false); // skip reason too short

    const done: HandoverState = {
      ...partial,
      tiers: { t1: { mode: 'skip', skipReason: 'Request is obsolete' } },
    };
    expect(handoverComplete(requirements, done)).toBe(true);
  });

  it('builds the payload the backend expects', () => {
    const state: HandoverState = {
      tiers: { t1: { mode: 'replace', replacementId: 'u2' } },
      leadership: { 'DEPARTMENT_LEADER:dep-1': { mode: 'skip', skipReason: ' Post abolished ' } },
      submittedRequests: { r9: 'CANCEL' },
    };
    expect(toHandoverPayload(requirements, state)).toEqual({
      tiers: [{ id: 't1', replacementId: 'u2' }],
      leadership: [{ kind: 'DEPARTMENT_LEADER', id: 'dep-1', skipReason: 'Post abolished' }],
      submittedRequests: [{ requestId: 'r9', action: 'CANCEL' }],
    });
  });
});
