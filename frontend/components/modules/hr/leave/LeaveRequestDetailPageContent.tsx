'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import { ArrowLeft, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageLeaveRequests,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  useCancelLeaveRequest,
  useDeleteLeaveRequest,
  useLeaveRequest,
} from '@/lib/query/leave';
import { useApprovalRequest } from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Leave request detail with approval tier sidebar.
 */
export default function LeaveRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const canManage = useCanManageLeaveRequests();
  const currentUser = useCurrentUser();
  const detailQuery = useLeaveRequest(requestId);
  const cancelMutation = useCancelLeaveRequest(requestId);
  const deleteMutation = useDeleteLeaveRequest();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const request = detailQuery.data;
  const approvalRequestId = request?.approvalRequestId ?? null;
  const approvalQuery = useApprovalRequest(
    approvalRequestId ?? '',
    Boolean(approvalRequestId) &&
      !(request?.approvalRequest?.tiers && request.approvalRequest.tiers.length > 0),
  );

  const approvalRequest =
    request?.approvalRequest?.tiers &&
    request.approvalRequest.tiers.length > 0
      ? request.approvalRequest
      : (approvalQuery.data ?? request?.approvalRequest ?? null);

  const tiers = useMemo(
    () => (approvalRequest?.tiers ?? []) as ApprovalTier[],
    [approvalRequest?.tiers],
  );

  useEffect(() => {
    if (canViewHr || detailQuery.isLoading) {
      return;
    }

    if (
      detailQuery.isError &&
      detailQuery.error instanceof ApiRequestError &&
      (detailQuery.error.status === 403 || detailQuery.error.status === 404)
    ) {
      router.replace('/approvals');
      return;
    }

    if (
      request &&
      currentUser.data?.id &&
      request.employeeId !== currentUser.data.id
    ) {
      router.replace('/approvals');
    }
  }, [
    canViewHr,
    currentUser.data?.id,
    detailQuery.error,
    detailQuery.isError,
    detailQuery.isLoading,
    request,
    router,
  ]);

  const isOwner =
    Boolean(request) &&
    Boolean(currentUser.data?.id) &&
    request?.employeeId === currentUser.data?.id;

  const canEdit =
    Boolean(request) &&
    (request?.status === 'DRAFT' || request?.status === 'RETURNED') &&
    (canManage || isOwner);

  const canCancel =
    Boolean(request) &&
    (canManage || isOwner) &&
    (request?.status === 'DRAFT' ||
      request?.status === 'SUBMITTED' ||
      request?.status === 'IN_REVIEW');

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Leave request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel leave request', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(requestId);
      messageApi.success(t('hr.messages.leaveRequestDeleted'));
      setConfirmDelete(false);
      router.push('/hr/leave-requests');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteLeaveRequest'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !request) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Leave request not found'
        }
        action={
          <Button onClick={() => router.push('/hr/leave-requests')}>
            Back to list
          </Button>
        }
      />
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    request.employeeId !== currentUser.data.id
  ) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push('/hr/leave-requests')}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] self-start transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Leave Requests</span>
      </button>

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {request.requestNumber}
              </span>
              <span className="text-[var(--color-border-secondary)]">·</span>
              <Tag className="m-0">{formatLeaveType(request.leaveType, t)}</Tag>
              <StatusBadge
                label={formatLeaveStatus(request.status, t)}
                variant={leaveStatusVariant(request.status)}
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {request.approvalRequestId ? (
                <Button
                  size="small"
                  onClick={() =>
                    router.push(`/approvals/${request.approvalRequestId}`)
                  }
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.viewInApprovals')}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  size="small"
                  onClick={() =>
                    router.push(`/hr/leave-requests/${requestId}/edit`)
                  }
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.editLeaveRequest')}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmCancel(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.cancelRequest')}
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmDelete(true)}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.deleteLeaveRequest')}
                </Button>
              ) : null}
            </div>
          </div>

          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
            {formatLeaveType(request.leaveType, t)}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatLeaveEmployeeName(request.employee)}
            </span>
            {request.submittedAt ? (
              <>
                <span className="text-[var(--color-border-secondary)]">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar
                    size={13}
                    className="text-[var(--color-text-tertiary)]"
                  />
                  {formatProjectDate(request.submittedAt)}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: t('hr.labels.startDate'), value: formatProjectDate(request.startDate) },
          { label: t('hr.labels.endDate'), value: formatProjectDate(request.endDate) },
          { label: t('hr.labels.days'), value: String(request.days), emphasize: true },
          {
            label: t('hr.labels.leaveType'),
            value: formatLeaveType(request.leaveType, t),
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <MetaItem label={t('hr.labels.employee')}>
                {formatLeaveEmployeeName(request.employee)}
              </MetaItem>
              <MetaItem label={t('hr.labels.leaveType')}>
                <StatusBadge
                  label={formatLeaveType(request.leaveType, t)}
                  variant={leaveTypeVariant(request.leaveType)}
                />
              </MetaItem>
              <MetaItem label={t('hr.labels.startDate')}>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar
                    size={13}
                    className="text-[var(--color-text-tertiary)]"
                  />
                  {formatProjectDate(request.startDate)}
                </span>
              </MetaItem>
              <MetaItem label={t('hr.labels.endDate')}>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar
                    size={13}
                    className="text-[var(--color-text-tertiary)]"
                  />
                  {formatProjectDate(request.endDate)}
                </span>
              </MetaItem>
              <MetaItem label={t('hr.labels.days')}>
                <span className="font-semibold">{request.days}</span>
              </MetaItem>
              {request.reason?.trim() ? (
                <div className="sm:col-span-2">
                  <MetaItem label={t('hr.labels.reason')}>
                    <p className="whitespace-pre-wrap leading-relaxed m-0">
                      {request.reason}
                    </p>
                  </MetaItem>
                </div>
              ) : null}
            </div>
          </SectionCard>

          {request.balance ? (
            <SectionCard title={t('hr.section.leaveBalance')} bodyClassName="px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <MetaItem label={t('hr.labels.entitled')}>
                  {request.balance.entitled}
                </MetaItem>
                <MetaItem label={t('hr.labels.broughtForward')}>
                  {request.balance.broughtForward}
                </MetaItem>
                <MetaItem label={t('hr.labels.used')}>
                  {request.balance.used}
                </MetaItem>
                <MetaItem label={t('hr.labels.pending')}>
                  {request.balance.pending}
                </MetaItem>
                <MetaItem label={t('hr.labels.remaining')}>
                  <span className="font-semibold">{request.balance.remaining}</span>
                </MetaItem>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest.currentTier ?? 0}
            />
          ) : (
            <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-5 py-4">
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                {t('hr.empty.noApprovalChain')}
              </p>
            </SectionCard>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel leave request?"
        description="This will cancel the leave request and release any pending balance. This cannot be undone."
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.empty.deleteLeaveTitle')}
        description={t('hr.empty.deleteLeaveDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
