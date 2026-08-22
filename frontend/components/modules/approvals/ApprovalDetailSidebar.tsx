'use client';

import { Alert, Button, Space, Timeline, Typography } from 'antd';
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
): string {
  if (status === 'APPROVED') {
    return 'Fully approved — no further action required';
  }
  if (status === 'REJECTED') {
    return 'Request rejected — no further action required';
  }
  if (status === 'CANCELLED') {
    return 'Request cancelled — no further action required';
  }
  if (status === 'RETURNED') {
    return isRequester
      ? 'Returned — update and resubmit to continue'
      : 'Returned to requester — waiting for resubmit';
  }
  if (
    currentTier &&
    (currentTier.decision === 'PENDING' ||
      currentTier.decision === 'CONDITIONALLY_APPROVED')
  ) {
    return `Waiting on ${currentTier.label} (${formatApprovalUserName(currentTier.approver)})`;
  }
  return 'No active approval actions';
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
  onApprove: () => void;
  onConditionalApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
  onResolveCondition: (tier: ApprovalTier, index: number) => void;
}

/**
 * Approval detail sidebar — tier timeline, conditions, and approver actions.
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
  onApprove,
  onConditionalApprove,
  onReturn,
  onReject,
  onResolveCondition,
}: ApprovalDetailSidebarProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  const activeCurrent = findCurrentTier(sorted, request.currentTier);

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
      <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {t('hr.section.approvalChain')}
          </h3>
        </div>
        <div className="px-3 py-4 sm:px-5">
          {sorted.length === 0 ? (
            <Typography.Text type="secondary">
              {t('hr.empty.noApprovalChain')}
            </Typography.Text>
          ) : (
            <Timeline
              items={sorted.map((tier) => {
                const conditions = parseTierConditions(tier.conditions);
                const isCurrent = tier.id === activeCurrent?.id;
                return {
                  color:
                    tier.decision === 'APPROVED'
                      ? 'green'
                      : tier.decision === 'REJECTED'
                        ? 'red'
                        : tier.decision === 'RETURNED'
                          ? 'orange'
                          : isCurrent
                            ? 'blue'
                            : 'gray',
                  icon:
                    tier.decision === 'APPROVED' ? (
                      <CheckCircle2 size={16} color={tokens.colorGreen600} />
                    ) : tier.decision === 'PENDING' ? (
                      <Clock3 size={16} color={tokens.colorAmber400} />
                    ) : (
                      <Circle size={14} color={tokens.colorGray600} />
                    ),
                  content: (
                    <div style={{ paddingBottom: 8 }}>
                      <Space wrap size={6}>
                        <Typography.Text strong>{tier.label}</Typography.Text>
                        <StatusBadge
                          label={formatApprovalStatus(tier.decision, t)}
                          variant={approvalTierDecisionVariant(tier.decision)}
                        />
                        {isCurrent ? (
                          <StatusBadge label="Current" variant="cyan" />
                        ) : null}
                      </Space>
                      <div style={{ marginTop: 4 }}>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {formatApprovalUserName(tier.approver)}
                          {tier.resolver ? ` · ${tier.resolver}` : ''}
                        </Typography.Text>
                      </div>
                      {tier.decidedAt ? (
                        <div>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            Decided {formatProjectDate(tier.decidedAt)}
                          </Typography.Text>
                        </div>
                      ) : null}
                      {tier.comment ? (
                        <Typography.Paragraph
                          type="secondary"
                          style={{
                            marginTop: 6,
                            marginBottom: 0,
                            fontSize: 12,
                          }}
                        >
                          {tier.comment}
                        </Typography.Paragraph>
                      ) : null}
                      {conditions.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                          <Typography.Text
                            strong
                            style={{ fontSize: 12, display: 'block' }}
                          >
                            Conditions
                          </Typography.Text>
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
                                style={{
                                  marginTop: 6,
                                  padding: 8,
                                  borderRadius: 0,
                                  background: condition.resolved
                                    ? tokens.colorGreen50
                                    : tokens.colorAmber50,
                                }}
                              >
                                <Space
                                  align="start"
                                  style={{
                                    width: '100%',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <Typography.Text style={{ fontSize: 12 }}>
                                    {condition.resolved ? '✓ ' : '○ '}
                                    {condition.text}
                                  </Typography.Text>
                                  {canResolve ? (
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={resolveDisabled}
                                      title={
                                        resolveDisabled
                                          ? 'Waiting for employee response'
                                          : undefined
                                      }
                                      loading={resolveLoading}
                                      onClick={() =>
                                        onResolveCondition(tier, index)
                                      }
                                      style={{ borderRadius: 0 }}
                                    >
                                      Resolve
                                    </Button>
                                  ) : null}
                                </Space>
                                {!condition.resolved ? (
                                  <Typography.Paragraph
                                    style={{
                                      marginTop: 4,
                                      marginBottom: 0,
                                      fontSize: 12,
                                      color: conditionHasResponse
                                        ? tokens.colorGreen600
                                        : tokens.colorAmber400,
                                    }}
                                  >
                                    {conditionHasResponse
                                      ? '✓ Employee responded — ready to resolve'
                                      : '⏳ Waiting for employee response'}
                                  </Typography.Paragraph>
                                ) : null}
                                {conditionResponses.map((resp) => (
                                  <Typography.Paragraph
                                    key={resp.id}
                                    type="secondary"
                                    style={{
                                      marginTop: 6,
                                      marginBottom: 0,
                                      fontSize: 12,
                                    }}
                                  >
                                    Response:{' '}
                                    {resp.note?.trim() || '(attachments only)'}
                                    {(resp.documents?.length ?? 0) > 0
                                      ? ` · ${resp.documents?.length} file(s)`
                                      : ''}
                                  </Typography.Paragraph>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ),
                };
              })}
            />
          )}

          {isActiveApprover && currentTier ? (
            <Space
              orientation="vertical"
              style={{ width: '100%', marginTop: 8 }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Actions for {currentTier.label}
              </Typography.Text>
              <Button
                type="primary"
                block
                disabled={actionsDisabled}
                title={
                  actionsDisabled
                    ? 'Resolve all conditions before approving'
                    : undefined
                }
                onClick={onApprove}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.approve')}
              </Button>
              <Button
                block
                disabled={actionsDisabled}
                onClick={onConditionalApprove}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.conditionallyApprove')}
              </Button>
              <Button
                block
                disabled={actionsDisabled}
                onClick={onReturn}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.return')}
              </Button>
              <Button
                danger
                block
                disabled={actionsDisabled}
                onClick={onReject}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.reject')}
              </Button>
              {actionsDisabled ? (
                <Typography.Paragraph
                  style={{
                    marginBottom: 0,
                    marginTop: 4,
                    fontSize: 13,
                    color: tokens.colorAmber400,
                  }}
                >
                  All conditions must be resolved before taking action.
                </Typography.Paragraph>
              ) : null}
            </Space>
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
              style={{ marginTop: 8 }}
              title={resolveWaitingMessage(
                request.status,
                currentTier,
                isRequester,
              )}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
