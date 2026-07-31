'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  Skeleton,
  Space,
  Timeline,
  Typography,
} from 'antd';
import { ArrowLeft, CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  useAddApprovalCondition,
  useApprovalRequest,
  useApproveApprovalTier,
  useRejectApprovalTier,
  useResolveApprovalCondition,
  useReturnApprovalTier,
} from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  approvalTierDecisionVariant,
  findCurrentTier,
  formatApprovalStatus,
  formatApprovalUserName,
  formatFormDataValue,
  getFormFieldLabels,
  parseTierConditions,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

type ActionModalKind = 'approve' | 'conditional' | 'return' | 'reject' | null;

/**
 * Approval request detail with tier chain and approver actions.
 */
export default function ApprovalDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';

  const detailQuery = useApprovalRequest(requestId);
  const approveMutation = useApproveApprovalTier(requestId);
  const rejectMutation = useRejectApprovalTier(requestId);
  const returnMutation = useReturnApprovalTier(requestId);
  const addConditionMutation = useAddApprovalCondition(requestId);
  const resolveConditionMutation = useResolveApprovalCondition(requestId);

  const [actionModal, setActionModal] = useState<ActionModalKind>(null);
  const [note, setNote] = useState('');
  const [conditionText, setConditionText] = useState('');

  const request = detailQuery.data;
  const tiers = useMemo(
    () =>
      [...(request?.tiers ?? [])].sort(
        (a, b) => a.tierOrder - b.tierOrder,
      ),
    [request?.tiers],
  );
  const currentTier = findCurrentTier(tiers, request?.currentTier ?? 0);
  const isActiveApprover =
    Boolean(currentUserId) &&
    Boolean(currentTier) &&
    currentTier?.approverId === currentUserId &&
    (request?.status === 'PENDING' ||
      request?.status === 'IN_REVIEW' ||
      request?.status === 'SUBMITTED');

  const fieldLabels = useMemo(
    () => getFormFieldLabels(request?.category?.formSchema),
    [request?.category?.formSchema],
  );

  const formEntries = useMemo(() => {
    const data = request?.formData ?? {};
    return Object.entries(data)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => ({
        key,
        label: fieldLabels.get(key) ?? key,
        value: formatFormDataValue(value),
      }));
  }, [request?.formData, fieldLabels]);

  const displayStatus = request
    ? resolveDisplayStatus(request.status, currentTier)
    : null;

  const actionLoading =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    returnMutation.isPending ||
    addConditionMutation.isPending;

  function closeModal(): void {
    setActionModal(null);
    setNote('');
    setConditionText('');
  }

  async function handleApprove(): Promise<void> {
    if (!currentTier) return;
    try {
      await approveMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Tier approved');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to approve tier', messageApi);
    }
  }

  async function handleConditionalApprove(): Promise<void> {
    if (!currentTier || !conditionText.trim()) {
      messageApi.warning('Enter a condition before continuing');
      return;
    }
    try {
      await addConditionMutation.mutateAsync({
        tierId: currentTier.id,
        payload: { text: conditionText.trim() },
      });
      await approveMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Conditionally approved');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to conditionally approve', messageApi);
    }
  }

  async function handleReturn(): Promise<void> {
    if (!currentTier) return;
    try {
      await returnMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Request returned to submitter');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to return request', messageApi);
    }
  }

  async function handleReject(): Promise<void> {
    if (!currentTier) return;
    try {
      await rejectMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Request rejected');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to reject request', messageApi);
    }
  }

  async function handleResolveCondition(
    tier: ApprovalTier,
    index: number,
  ): Promise<void> {
    try {
      await resolveConditionMutation.mutateAsync({
        tierId: tier.id,
        index,
      });
      messageApi.success('Condition marked resolved');
    } catch (error) {
      notifyApiError(error, 'Failed to resolve condition', messageApi);
    }
  }

  if (detailQuery.isLoading && !request) {
    return (
      <div className="p-4 sm:p-[18px]">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    const message =
      detailQuery.error instanceof ApiRequestError
        ? detailQuery.error.message
        : 'Approval request not found';
    return (
      <div className="p-4 sm:p-[18px]">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/approvals')}
          className="mb-4"
        >
          Back to Approvals
        </Button>
        <Alert type="error" showIcon message={message} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-[18px]">
      <Button
        type="text"
        icon={<ArrowLeft size={16} />}
        onClick={() => router.push('/approvals')}
        className="mb-4"
      >
        Back to Approvals
      </Button>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              {request.requestNumber}
              {request.category?.name ? ` · ${request.category.name}` : ''}
            </Typography.Text>
            <Space wrap align="center">
              <Typography.Title level={3} style={{ margin: 0 }}>
                {request.title}
              </Typography.Title>
              {displayStatus ? (
                <StatusBadge
                  label={displayStatus.label}
                  variant={displayStatus.variant}
                />
              ) : null}
            </Space>
            <Typography.Text type="secondary">
              Submitted by {formatApprovalUserName(request.requester)}
              {' · '}
              {formatProjectDate(
                request.submittedAt ?? request.createdAt ?? null,
              )}
            </Typography.Text>
          </Space>

          <Typography.Title level={5} style={{ marginTop: 28 }}>
            Request details
          </Typography.Title>
          {formEntries.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No form data"
            />
          ) : (
            <Descriptions bordered size="small" column={1}>
              {formEntries.map((entry) => (
                <Descriptions.Item key={entry.key} label={entry.label}>
                  {entry.value}
                </Descriptions.Item>
              ))}
            </Descriptions>
          )}

          <Typography.Title level={5} style={{ marginTop: 28 }}>
            Comments
          </Typography.Title>
          {(request.comments ?? []).length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No comments yet"
            />
          ) : (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              {(request.comments ?? []).map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    border: `1px solid ${tokens.colorBorder}`,
                    borderRadius: 8,
                    padding: 12,
                    background: tokens.colorSurfaceSecondary,
                  }}
                >
                  <Space
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Typography.Text strong>
                      {formatApprovalUserName(comment.commenter)}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatProjectDate(comment.createdAt)}
                    </Typography.Text>
                  </Space>
                  <Typography.Paragraph
                    style={{ marginBottom: 0, marginTop: 6 }}
                  >
                    {comment.commentText}
                  </Typography.Paragraph>
                </div>
              ))}
            </Space>
          )}
        </div>

        <aside
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
            borderRadius: 8,
            padding: 20,
            position: 'sticky',
            top: 16,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Approval chain
          </Typography.Title>

          <Timeline
            items={tiers.map((tier) => {
              const conditions = parseTierConditions(tier.conditions);
              const isCurrent = tier.id === currentTier?.id;
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
                        label={formatApprovalStatus(tier.decision)}
                        variant={approvalTierDecisionVariant(tier.decision)}
                      />
                      {isCurrent ? (
                        <StatusBadge label="Current" variant="cyan" />
                      ) : null}
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
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
                        style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}
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
                          const canResolve =
                            !condition.resolved &&
                            (currentUserId === tier.approverId ||
                              currentUserId === request.requestedBy);
                          return (
                            <div
                              key={`${tier.id}-c-${index}`}
                              style={{
                                marginTop: 6,
                                padding: 8,
                                borderRadius: 6,
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
                                    loading={resolveConditionMutation.isPending}
                                    onClick={() =>
                                      void handleResolveCondition(tier, index)
                                    }
                                  >
                                    Resolve
                                  </Button>
                                ) : null}
                              </Space>
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

          {isActiveApprover && currentTier ? (
            <Space orientation="vertical" style={{ width: '100%', marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Actions for {currentTier.label}
              </Typography.Text>
              <Button
                type="primary"
                block
                onClick={() => setActionModal('approve')}
              >
                Approve
              </Button>
              <Button block onClick={() => setActionModal('conditional')}>
                Conditionally Approve
              </Button>
              <Button block onClick={() => setActionModal('return')}>
                Return
              </Button>
              <Button danger block onClick={() => setActionModal('reject')}>
                Reject
              </Button>
            </Space>
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 8 }}
              message={
                currentTier
                  ? `Waiting on ${currentTier.label} (${formatApprovalUserName(currentTier.approver)})`
                  : 'No active approval actions'
              }
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={actionModal === 'approve'}
        title="Approve tier"
        description="Confirm approval of the current tier."
        confirmLabel="Approve"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleApprove()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Optional note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'conditional'}
        title="Conditionally approve"
        description="Add a condition that must be resolved before the chain advances."
        confirmLabel="Submit"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleConditionalApprove()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Condition text (required)"
          value={conditionText}
          onChange={(event) => setConditionText(event.target.value)}
          style={{ marginTop: 12 }}
        />
        <Input.TextArea
          rows={2}
          placeholder="Optional note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 8 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'return'}
        title="Return request"
        description="Return this request to the submitter for revision."
        confirmLabel="Return"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReturn()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Note for submitter"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'reject'}
        title="Reject request"
        description="This will reject the request permanently. Confirm to continue."
        confirmLabel="Reject"
        danger
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReject()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Rejection reason"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>
    </div>
  );
}
