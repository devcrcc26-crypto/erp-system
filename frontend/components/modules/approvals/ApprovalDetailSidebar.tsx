'use client';

import { useState } from 'react';
import { Alert, Button } from 'antd';
import { CheckCircle2, Circle, Clock3, RotateCcw, XCircle } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type {
  ApprovalRequestDetail,
  ApprovalResponse,
  ApprovalTier,
} from '@/lib/api/approvals.types';
import {
  approvalTierDecisionVariant,
  findCurrentTier,
  formatApprovalStatus,
  formatApprovedOnBehalf,
  formatApprovalUserName,
  parseTierConditions,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanReassignApprovals } from '@/hooks/use-auth-capabilities';
import ApprovalReassignDialog from '@/components/modules/approvals/ApprovalReassignDialog';

import './approvals-v2.css';

/** Request statuses in which a pending tier can still be reassigned (matches the API). */
const REASSIGNABLE_REQUEST_STATUSES: ReadonlyArray<
  ApprovalRequestDetail['status']
> = ['PENDING', 'SUBMITTED', 'IN_REVIEW'];

type TierCardState =
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'current'
  | 'pending';

function resolveTierState(
  tier: ApprovalTier,
  isCurrent: boolean,
): TierCardState {
  if (tier.decision === 'APPROVED') return 'approved';
  if (tier.decision === 'REJECTED') return 'rejected';
  if (tier.decision === 'RETURNED') return 'returned';
  if (isCurrent) return 'current';
  return 'pending';
}

function TierStateIcon({ state }: { state: TierCardState }): React.ReactNode {
  if (state === 'approved') {
    return <CheckCircle2 size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'rejected') {
    return <XCircle size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'returned') {
    return <RotateCcw size={16} strokeWidth={2} aria-hidden />;
  }
  if (state === 'current') {
    return <Clock3 size={16} strokeWidth={2} aria-hidden />;
  }
  return <Circle size={16} strokeWidth={2} aria-hidden />;
}

function resolveWaitingMessage(
  status: ApprovalRequestDetail['status'],
  currentTier: ApprovalTier | undefined,
  isRequester: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (status === 'APPROVED') {
    return t('pages.approvals.waiting.approved');
  }
  if (status === 'REJECTED') {
    return t('pages.approvals.waiting.rejected');
  }
  if (status === 'CANCELLED') {
    return t('pages.approvals.waiting.cancelled');
  }
  if (status === 'RETURNED') {
    return isRequester
      ? t('pages.approvals.waiting.returnedRequester')
      : t('pages.approvals.waiting.returnedOther');
  }
  if (
    currentTier &&
    (currentTier.decision === 'PENDING' ||
      currentTier.decision === 'CONDITIONALLY_APPROVED')
  ) {
    return t('pages.approvals.waiting.onTier', {
      label: currentTier.label,
      name: formatApprovalUserName(currentTier.approver),
    });
  }
  return t('pages.approvals.waiting.none');
}

export interface ApprovalDetailSidebarProps {
  request: ApprovalRequestDetail;
  tiers: ApprovalTier[];
  currentTier: ApprovalTier | undefined;
  isRequester: boolean;
  isActiveApprover: boolean;
  currentUserId: string;
  responses: ApprovalResponse[];
  actionsDisabled: boolean;
  resolveLoading: boolean;
  onResolveCondition: (tier: ApprovalTier, index: number) => void;
}

/**
 * Approval detail sidebar - soft tier cards, conditions, and status.
 */
export default function ApprovalDetailSidebar({
  request,
  tiers,
  currentTier,
  isRequester,
  isActiveApprover,
  currentUserId,
  responses,
  actionsDisabled,
  resolveLoading,
  onResolveCondition,
}: ApprovalDetailSidebarProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  const activeCurrent = findCurrentTier(sorted, request.currentTier);
  const canReassign =
    useCanReassignApprovals() &&
    REASSIGNABLE_REQUEST_STATUSES.includes(request.status);
  const [reassignTier, setReassignTier] = useState<ApprovalTier | null>(null);

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
      <div className="erp-approval-chain">
        <div className="erp-approval-chain-header">
          <h3 className="erp-approval-chain-title">
            {t('hr.section.approvalChain')}
          </h3>
        </div>
        <div className="erp-approval-chain-body">
          {sorted.length === 0 ? (
            <p className="erp-users-cell-sub m-0">
              {t('hr.empty.noApprovalChain')}
            </p>
          ) : (
            sorted.map((tier) => {
              const conditions = parseTierConditions(tier.conditions);
              const isCurrent = tier.id === activeCurrent?.id;
              const state = resolveTierState(tier, isCurrent);

              return (
                <article
                  key={tier.id}
                  className="erp-approval-tier-card"
                  data-state={state}
                >
                  <span className="erp-approval-tier-index" aria-hidden>
                    <TierStateIcon state={state} />
                  </span>
                  <div className="erp-approval-tier-main">
                    <div className="erp-approval-tier-top">
                      <p className="erp-approval-tier-label">{tier.label}</p>
                      <StatusBadge
                        label={formatApprovalStatus(tier.decision, t)}
                        variant={approvalTierDecisionVariant(tier.decision)}
                      />
                      {isCurrent ? (
                        <StatusBadge
                          label={t('pages.approvals.currentTierBadge')}
                          variant="cyan"
                        />
                      ) : null}
                    </div>
                    <p className="erp-approval-tier-meta">
                      {formatApprovalUserName(tier.approver)}
                      {tier.resolver ? ` · ${tier.resolver}` : ''}
                    </p>
                    {canReassign && tier.decision === 'PENDING' ? (
                      <Button
                        size="small"
                        className="mt-1.5 !rounded-[10px]"
                        onClick={() => setReassignTier(tier)}
                        aria-label={t('pages.approvals.reassign.buttonAria', {
                          label: tier.label,
                        })}
                      >
                        {t('pages.approvals.reassign.button')}
                      </Button>
                    ) : null}
                    {formatApprovedOnBehalf(tier, t) ? (
                      <p className="erp-approval-tier-meta">
                        {formatApprovedOnBehalf(tier, t)}
                      </p>
                    ) : null}
                    {tier.decidedAt ? (
                      <p className="erp-approval-tier-meta">
                        {t('pages.approvals.decidedOn', {
                          date: formatProjectDate(tier.decidedAt),
                        })}
                      </p>
                    ) : null}
                    {tier.comment ? (
                      <p className="erp-approval-tier-comment">{tier.comment}</p>
                    ) : null}
                    {conditions.length > 0 ? (
                      <div className="mt-1 flex flex-col gap-2">
                        {conditions.map((condition, index) => {
                          const conditionHasResponse = responses.some(
                            (r) =>
                              r.responseType === 'CONDITION_RESPONSE' &&
                              r.conditionIndex === index,
                          );
                          const canResolve =
                            !condition.resolved &&
                            currentUserId === tier.approverId;
                          const resolveDisabled = !conditionHasResponse;
                          const conditionResponses = responses.filter(
                            (r) =>
                              r.responseType === 'CONDITION_RESPONSE' &&
                              r.conditionIndex === index,
                          );
                          return (
                            <div
                              key={`${tier.id}-c-${index}`}
                              className="erp-approval-condition"
                              data-resolved={
                                condition.resolved ? 'true' : 'false'
                              }
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="erp-approval-condition-text">
                                  {condition.resolved ? '✓ ' : '○ '}
                                  {condition.text}
                                </p>
                                {canResolve ? (
                                  <Button
                                    type="link"
                                    size="small"
                                    className="!h-auto !p-0"
                                    disabled={resolveDisabled}
                                    title={
                                      resolveDisabled
                                        ? t(
                                            'pages.approvals.waitingEmployeeResponse',
                                          )
                                        : undefined
                                    }
                                    loading={resolveLoading}
                                    onClick={() =>
                                      onResolveCondition(tier, index)
                                    }
                                  >
                                    {t('pages.approvals.resolve')}
                                  </Button>
                                ) : null}
                              </div>
                              {!condition.resolved ? (
                                <p
                                  className={`m-0 mt-1 text-xs ${
                                    conditionHasResponse
                                      ? 'text-[#639922]'
                                      : 'text-[#BA7517]'
                                  }`}
                                >
                                  {conditionHasResponse
                                    ? t(
                                        'pages.approvals.employeeRespondedReady',
                                      )
                                    : t(
                                        'pages.approvals.waitingEmployeeResponse',
                                      )}
                                </p>
                              ) : null}
                              {conditionResponses.map((resp) => (
                                <p
                                  key={resp.id}
                                  className="erp-approval-tier-meta"
                                >
                                  {t('pages.approvals.responseLabel')}:{' '}
                                  {resp.note?.trim() ||
                                    t('pages.approvals.attachmentsOnly')}
                                  {(resp.documents?.length ?? 0) > 0
                                    ? ` · ${t('pages.approvals.fileCount', {
                                        count: resp.documents?.length ?? 0,
                                      })}`
                                    : ''}
                                </p>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}

          {isActiveApprover && currentTier ? (
            actionsDisabled ? (
              <p className="erp-approval-chain-footer m-0 text-xs text-[#BA7517]">
                {t('pages.approvals.resolveConditionsFirst')}
              </p>
            ) : null
          ) : (
            <Alert
              type={
                request.status === 'APPROVED'
                  ? 'success'
                  : request.status === 'REJECTED' ||
                      request.status === 'CANCELLED'
                    ? 'error'
                    : 'info'
              }
              showIcon
              className="erp-approval-chain-footer !rounded-[12px]"
              title={resolveWaitingMessage(
                request.status,
                currentTier,
                isRequester,
                t,
              )}
            />
          )}
        </div>
      </div>
      <ApprovalReassignDialog
        open={reassignTier != null}
        requestId={request.id}
        requesterId={request.requestedBy}
        tier={reassignTier}
        onClose={() => setReassignTier(null)}
      />
    </aside>
  );
}
