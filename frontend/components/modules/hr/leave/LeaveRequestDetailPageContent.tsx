'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Leave request detail - Users / employee profile chrome.
 */
export default function LeaveRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const canManage = canViewHr;
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
      !(
        request?.approvalRequest?.tiers &&
        request.approvalRequest.tiers.length > 0
      ),
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
      messageApi.success(t('hr.messages.leaveRequestCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelLeaveRequest'),
        messageApi,
      );
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
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.leaveRequestNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/leave-requests')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (
    !canViewHr &&
    currentUser.data?.id &&
    request.employeeId !== currentUser.data.id
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <div className="flex min-h-[240px] items-center justify-center">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  const employeeName = formatLeaveEmployeeName(request.employee);
  const leaveTypeLabel = formatLeaveType(request.leaveType, t);

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/leave-requests')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {request.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${request.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => setConfirmCancel(true)}
                aria-label={t('hr.buttons.cancelRequest')}
              >
                {isNarrow ? undefined : t('hr.buttons.cancelRequest')}
              </Button>
            ) : null}
            {(canEdit || canManage) ? (
              <Space.Compact>
                {canEdit ? (
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() =>
                      router.push(`/hr/leave-requests/${requestId}/edit`)
                    }
                    aria-label={t('common.update')}
                  >
                    {isNarrow ? undefined : t('common.update')}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setConfirmDelete(true)}
                    aria-label={t('common.delete')}
                  >
                    {isNarrow ? undefined : t('common.delete')}
                  </Button>
                ) : null}
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{request.requestNumber}</span>
              <StatusBadge
                label={formatLeaveStatus(request.status, t)}
                variant={leaveStatusVariant(request.status)}
              />
              <span className="erp-users-role-tag">{leaveTypeLabel}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {leaveTypeLabel}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">{employeeName}</p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                `${t('hr.labels.startDate')} ${formatProjectDate(request.startDate)}`,
                `${t('hr.labels.endDate')} ${formatProjectDate(request.endDate)}`,
                `${request.days} ${t('hr.labels.days').toLowerCase()}`,
              ].join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.startDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(request.startDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.endDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(request.endDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.days')}</p>
            <p className="erp-employee-meta-value">{request.days}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.leaveType')}</p>
            <p className="erp-employee-meta-value">{leaveTypeLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.labels.employee')}>
                  {employeeName}
                </MetaItem>
                <MetaItem label={t('hr.labels.leaveType')}>
                  <StatusBadge
                    label={leaveTypeLabel}
                    variant={leaveTypeVariant(request.leaveType)}
                  />
                </MetaItem>
                <MetaItem label={t('hr.labels.startDate')}>
                  {formatProjectDate(request.startDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.endDate')}>
                  {formatProjectDate(request.endDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.days')}>
                  <span className="font-semibold">{request.days}</span>
                </MetaItem>
                {request.periods && request.periods.length > 0 ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.form.periods')}>
                      <ul className="m-0 list-none p-0">
                        {request.periods.map((period) => (
                          <li key={`${period.startDate}-${period.endDate}`}>
                            {formatProjectDate(period.startDate)} –{' '}
                            {formatProjectDate(period.endDate)} ({period.days}{' '}
                            {t('hr.labels.days').toLowerCase()})
                          </li>
                        ))}
                      </ul>
                    </MetaItem>
                  </div>
                ) : null}
                {request.breakdown && request.breakdown.length > 0 ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.form.periodPreview')}>
                      <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
                        {request.breakdown.map((day) => (
                          <li
                            key={day.date}
                            className="flex justify-between gap-2"
                          >
                            <span>{formatProjectDate(day.date)}</span>
                            <span>
                              {day.type === 'holiday' && day.holidayName
                                ? day.holidayName
                                : t(`hr.dayType.${day.type}`)}
                              {day.weight > 0 ? ` · ${day.weight}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </MetaItem>
                  </div>
                ) : null}
                {request.reason?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.reason')}>
                      <p className="m-0 whitespace-pre-wrap leading-relaxed">
                        {request.reason}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            {request.balance ? (
              <DetailSection title={t('hr.section.leaveBalance')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <span className="font-semibold">
                      {request.balance.remaining}
                    </span>
                  </MetaItem>
                </div>
              </DetailSection>
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelLeaveTitle')}
        description={t('hr.dialog.cancelLeaveDesc')}
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
