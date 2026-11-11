'use client';

import './leave-v2.css';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Clock3,
  FileText,
  Hash,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import LeavePeriodBreakdownTable from '@/components/modules/hr/leave/LeavePeriodBreakdownTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
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
import { resolveLeaveRequestDetailBackHref } from '@/lib/utils/hr-self-service-nav';
import { formatProjectDate } from '@/lib/utils/project-display';

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-pro-card erp-leave-section-card">
      <div className="erp-employee-section">
        <div className="erp-employee-section-header">
          <h3 className="erp-employee-section-title">{title}</h3>
        </div>
        <div className="erp-employee-section-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Leave request detail - Employees / evaluation v2 hero and soft sections.
 */
export default function LeaveRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get('returnTo');
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

  const backHref = useMemo(
    () =>
      resolveLeaveRequestDetailBackHref({
        canViewHr,
        currentUserId: currentUser.data?.id,
        requestEmployeeId: request?.employeeId,
        returnTo: returnToParam,
      }),
    [canViewHr, currentUser.data?.id, request?.employeeId, returnToParam],
  );

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
      router.push(backHref);
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
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-detail-page erp-leave-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-v2">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.leaveRequestNotFound')
          }
          action={
            <Button onClick={() => router.push(backHref)}>
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
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-v2">
        <div className="erp-leave-loading">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

  const employee = request.employee;
  const employeeName = formatLeaveEmployeeName(employee);
  const leaveTypeLabel = formatLeaveType(request.leaveType, t);

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-leave-detail-page erp-leave-v2">
      <section className="erp-leave-detail-hero">
        <div className="erp-leave-hero-top">
          <div className="min-w-0">
            <Link href={backHref} className="erp-leave-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('hr.buttons.backToList')}
            </Link>
            <div className="erp-leave-hero-identity">
              {employee ? (
                <EvaluationListAvatar
                  firstName={employee.firstName}
                  lastName={employee.lastName}
                  userId={employee.id}
                />
              ) : null}
              <div className="min-w-0">
                <div className="erp-leave-hero-title-row">
                  <h2 className="erp-leave-hero-title">{employeeName}</h2>
                  <span className="erp-users-id-chip">
                    {request.requestNumber}
                  </span>
                  <StatusBadge
                    label={formatLeaveStatus(request.status, t)}
                    variant={leaveStatusVariant(request.status)}
                  />
                  <StatusBadge
                    label={leaveTypeLabel}
                    variant={leaveTypeVariant(request.leaveType)}
                  />
                </div>
                <p className="erp-leave-detail-meta">
                  <span>
                    <CalendarDays size={14} strokeWidth={2} aria-hidden />
                    {formatProjectDate(request.startDate)} –{' '}
                    {formatProjectDate(request.endDate)}
                  </span>
                  <span>
                    <Clock3 size={14} strokeWidth={2} aria-hidden />
                    <strong>{request.days}</strong>{' '}
                    {t('hr.labels.days').toLowerCase()}
                  </span>
                  <span>
                    <Hash size={14} strokeWidth={2} aria-hidden />
                    {leaveTypeLabel}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="erp-leave-hero-actions">
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
            {canEdit || canManage ? (
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

        <div className="erp-leave-fact-row">
          <div className="erp-leave-fact">
            <p className="erp-leave-fact-label">{t('hr.labels.startDate')}</p>
            <p className="erp-leave-fact-value erp-leave-fact-value--sm">
              {formatProjectDate(request.startDate)}
            </p>
          </div>
          <div className="erp-leave-fact">
            <p className="erp-leave-fact-label">{t('hr.labels.endDate')}</p>
            <p className="erp-leave-fact-value erp-leave-fact-value--sm">
              {formatProjectDate(request.endDate)}
            </p>
          </div>
          <div className="erp-leave-fact">
            <p className="erp-leave-fact-label">{t('hr.labels.days')}</p>
            <p className="erp-leave-fact-value">{request.days}</p>
          </div>
          <div className="erp-leave-fact">
            <p className="erp-leave-fact-label">{t('hr.labels.leaveType')}</p>
            <p className="erp-leave-fact-value erp-leave-fact-value--sm">
              {leaveTypeLabel}
            </p>
          </div>
        </div>
      </section>

      <div className="erp-leave-detail-layout">
        <div className="erp-leave-detail-main">
          <DetailSection title={t('hr.section.requestDetails')}>
            <div className="erp-leave-details">
              <div className="erp-leave-details-grid">
                <div className="erp-leave-field erp-leave-field--wide">
                  <span className="erp-leave-field-icon" aria-hidden>
                    <UserRound size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="erp-leave-field-label">
                      {t('hr.labels.employee')}
                    </p>
                    <div className="erp-leave-field-person">
                      {employee ? (
                        <EvaluationListAvatar
                          firstName={employee.firstName}
                          lastName={employee.lastName}
                          userId={employee.id}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="erp-leave-field-value truncate">
                          {employeeName}
                        </p>
                        {employee?.email ? (
                          <p className="erp-leave-field-hint truncate">
                            {employee.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="erp-leave-field">
                  <span className="erp-leave-field-icon" aria-hidden>
                    <Hash size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="erp-leave-field-label">
                      {t('hr.labels.leaveType')}
                    </p>
                    <div className="erp-leave-field-value-row">
                      <StatusBadge
                        label={leaveTypeLabel}
                        variant={leaveTypeVariant(request.leaveType)}
                      />
                    </div>
                  </div>
                </div>

                <div className="erp-leave-field">
                  <span className="erp-leave-field-icon" aria-hidden>
                    <Clock3 size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="erp-leave-field-label">
                      {t('hr.labels.days')}
                    </p>
                    <p className="erp-leave-field-value erp-leave-field-value--num">
                      {request.days}
                      <span className="erp-leave-field-unit">
                        {t('hr.labels.days').toLowerCase()}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="erp-leave-field">
                  <span className="erp-leave-field-icon" aria-hidden>
                    <CalendarDays size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="erp-leave-field-label">
                      {t('hr.labels.startDate')}
                    </p>
                    <p className="erp-leave-field-value">
                      {formatProjectDate(request.startDate)}
                    </p>
                  </div>
                </div>

                <div className="erp-leave-field">
                  <span className="erp-leave-field-icon" aria-hidden>
                    <CalendarDays size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="erp-leave-field-label">
                      {t('hr.labels.endDate')}
                    </p>
                    <p className="erp-leave-field-value">
                      {formatProjectDate(request.endDate)}
                    </p>
                  </div>
                </div>
              </div>

              {request.periods && request.periods.length > 0 ? (
                <div className="erp-leave-details-block">
                  <div className="erp-leave-details-block-head">
                    <CalendarRange size={15} strokeWidth={2} aria-hidden />
                    <span>{t('hr.form.periods')}</span>
                  </div>
                  <ul className="erp-leave-period-cards">
                    {request.periods.map((period, index) => (
                      <li
                        key={`${period.startDate}-${period.endDate}`}
                        className="erp-leave-period-card"
                      >
                        <span className="erp-leave-period-index">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="erp-leave-period-range">
                            {formatProjectDate(period.startDate)}
                            <span aria-hidden> → </span>
                            {formatProjectDate(period.endDate)}
                          </p>
                          <p className="erp-leave-period-days">
                            {period.days} {t('hr.labels.days').toLowerCase()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {request.breakdown && request.breakdown.length > 0 ? (
                <div className="erp-leave-details-block">
                  <div className="erp-leave-details-block-head">
                    <CalendarDays size={15} strokeWidth={2} aria-hidden />
                    <span>{t('hr.form.periodPreview')}</span>
                  </div>
                  <div className="erp-leave-breakdown-wrap">
                    <LeavePeriodBreakdownTable
                      breakdown={request.breakdown}
                    />
                  </div>
                </div>
              ) : null}

              {request.reason?.trim() ? (
                <div className="erp-leave-reason-panel">
                  <div className="erp-leave-details-block-head">
                    <FileText size={15} strokeWidth={2} aria-hidden />
                    <span>{t('hr.labels.reason')}</span>
                  </div>
                  <p className="erp-leave-reason">{request.reason}</p>
                </div>
              ) : null}
            </div>
          </DetailSection>

          {request.balance ? (
            <DetailSection title={t('hr.section.leaveBalance')}>
              <div className="erp-leave-balance-grid">
                <div className="erp-leave-balance-tile">
                  <p className="erp-leave-fact-label">
                    {t('hr.labels.entitled')}
                  </p>
                  <p className="erp-leave-fact-value">
                    {request.balance.entitled}
                  </p>
                </div>
                <div className="erp-leave-balance-tile">
                  <p className="erp-leave-fact-label">
                    {t('hr.labels.broughtForward')}
                  </p>
                  <p className="erp-leave-fact-value">
                    {request.balance.broughtForward}
                  </p>
                </div>
                <div className="erp-leave-balance-tile">
                  <p className="erp-leave-fact-label">{t('hr.labels.used')}</p>
                  <p className="erp-leave-fact-value">
                    {request.balance.used}
                  </p>
                </div>
                <div className="erp-leave-balance-tile">
                  <p className="erp-leave-fact-label">
                    {t('hr.labels.pending')}
                  </p>
                  <p className="erp-leave-fact-value">
                    {request.balance.pending}
                  </p>
                </div>
                <div className="erp-leave-balance-tile erp-leave-balance-tile--highlight">
                  <p className="erp-leave-fact-label">
                    {t('hr.labels.remaining')}
                  </p>
                  <p className="erp-leave-fact-value">
                    {request.balance.remaining}
                  </p>
                </div>
              </div>
            </DetailSection>
          ) : null}

          {(request.documents?.length ?? 0) > 0 ? (
            <DetailSection title={t('hr.section.attachments')}>
              <AttachmentDownloadList documents={request.documents} />
            </DetailSection>
          ) : null}
        </div>

        <aside className="erp-leave-detail-aside lg:sticky lg:top-4">
          {approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest.currentTier ?? 0}
            />
          ) : (
            <DetailSection title={t('hr.section.approvalChain')}>
              <p className="erp-users-cell-sub m-0">
                {t('hr.empty.noApprovalChain')}
              </p>
            </DetailSection>
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
