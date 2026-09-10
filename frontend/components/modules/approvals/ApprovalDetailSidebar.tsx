'use client';

import { Alert, Button } from 'antd';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type {
  ApprovalRequestDetail,
  ApprovalResponse,
  ApprovalTier,
} from '@/lib/api/approvals.types';
import { tokens } from '@/lib/theme/tokens';
import {
  approvalTierDecisionVariant,
  findCurrentTier,
  formatApprovalStatus,
  formatApprovalUserName,
  parseTierConditions,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
 * Approval detail sidebar — tier timeline, conditions, and status.
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

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
      <div className="erp-pro-card overflow-hidden">
        <div className="erp-employee-section-header !rounded-none border-b border-[#eef1f4]">
          <h3 className="erp-employee-section-title">
            {t('hr.section.approvalChain')}
          </h3>
        </div>
        <div className="px-3 py-4 sm:px-5">
          {sorted.length === 0 ? (
            <p className="erp-users-cell-sub m-0">
              {t('hr.empty.noApprovalChain')}
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-0 p-0">
              {sorted.map((tier, tierIndex) => {
                const conditions = parseTierConditions(tier.conditions);
                const isCurrent = tier.id === activeCurrent?.id;
                const isLast = tierIndex === sorted.length - 1;
                const dotColor =
                  tier.decision === 'APPROVED'
                    ? tokens.colorGreen600
                    : tier.decision === 'REJECTED'
                      ? '#D32F2F'
                      : tier.decision === 'RETURNED'
                        ? tokens.colorAmber400
                        : isCurrent
                          ? '#F47B20'
                          : tokens.colorGray600;
                const Icon =
                  tier.decision === 'APPROVED'
                    ? CheckCircle2
                    : tier.decision === 'PENDING' ||
                        tier.decision === 'CONDITIONALLY_APPROVED'
                      ? Clock3
                      : Circle;

                return (
                  <li key={tier.id} className="relative flex gap-3">
                    <div className="flex w-5 flex-col items-center">
                      <span
                        className="z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white"
                        aria-hidden
                      >
                        <Icon size={16} color={dotColor} />
                      </span>
                      {!isLast ? (
                        <span
                          className="mt-1 w-px flex-1 bg-[#e8ebef]"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="erp-users-cell-strong text-sm">
                          {tier.label}
                        </span>
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
                      <p className="erp-users-cell-sub m-0 mt-1 text-xs">
                        {formatApprovalUserName(tier.approver)}
                        {tier.resolver ? ` · ${tier.resolver}` : ''}
                      </p>
                      {tier.decidedAt ? (
                        <p className="erp-users-cell-sub m-0 mt-0.5 text-xs">
                          {t('pages.approvals.decidedOn', {
                            date: formatProjectDate(tier.decidedAt),
                          })}
                        </p>
                      ) : null}
                      {tier.comment ? (
                        <p className="erp-users-cell-sub m-0 mt-1.5 text-xs leading-relaxed">
                          {tier.comment}
                        </p>
                      ) : null}
                      {conditions.length > 0 ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <p className="erp-users-stat-label m-0">
                            {t('pages.approvals.conditions')}
                          </p>
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
                                className={`rounded-lg px-2.5 py-2 ${
                                  condition.resolved
                                    ? 'bg-[#EAF3DE]'
                                    : 'bg-[#FAEEDA]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="m-0 text-xs leading-relaxed text-[var(--color-text-primary)]">
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
                                    className="erp-users-cell-sub m-0 mt-1.5 text-xs"
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
                  </li>
                );
              })}
            </ol>
          )}

          {isActiveApprover && currentTier ? (
            actionsDisabled ? (
              <p className="m-0 mt-4 border-t border-[#eef1f4] pt-4 text-xs text-[#BA7517]">
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
              className="mt-4"
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
    </aside>
  );
}
