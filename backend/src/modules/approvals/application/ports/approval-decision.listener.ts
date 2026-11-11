/**
 * Listener interface for modules that react to final approval decisions.
 */
export type ApprovalFinalDecision = 'APPROVED' | 'REJECTED' | 'RETURNED';

export interface ApprovalDecisionListener {
  onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void>;
}

/** Nest DI token for optional leave (or other) finalization handlers. */
export const APPROVAL_DECISION_LISTENER = 'APPROVAL_DECISION_LISTENER';
