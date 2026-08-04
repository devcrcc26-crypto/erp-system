'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  useCancelLeaveRequest,
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

/**
 * Leave request detail with approval tier sidebar.
 */
export default function LeaveRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useLeaveRequest(requestId);
  const cancelMutation = useCancelLeaveRequest(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);

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

  const canCancel =
    Boolean(request) &&
    Boolean(currentUser.data?.id) &&
    request?.employeeId === currentUser.data?.id &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Leave request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel leave request', messageApi);
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
      {/* Page header */}
      <div className="mb-2">
        <button
          onClick={() => router.push('/hr/leave-requests')}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-3 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Leave Requests</span>
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
              Leave Requests · {request.requestNumber}
            </p>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)] leading-tight">
              {formatLeaveType(request.leaveType)} Leave
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {formatLeaveEmployeeName(request.employee)}
              {request.submittedAt
                ? ` · Submitted ${formatProjectDate(request.submittedAt)}`
                : null}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              label={formatLeaveStatus(request.status)}
              variant={leaveStatusVariant(request.status)}
            />
            {canCancel ? (
              <Button danger size="small" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Main content */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Request Details
              </h3>
            </div>
            <div className="px-5 py-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Employee
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatLeaveEmployeeName(request.employee)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Leave Type
                  </dt>
                  <dd>
                    <StatusBadge
                      label={formatLeaveType(request.leaveType)}
                      variant={leaveTypeVariant(request.leaveType)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Start Date
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatProjectDate(request.startDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    End Date
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatProjectDate(request.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Days
                  </dt>
                  <dd className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {request.days}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Status
                  </dt>
                  <dd>
                    <StatusBadge
                      label={formatLeaveStatus(request.status)}
                      variant={leaveStatusVariant(request.status)}
                    />
                  </dd>
                </div>
                {request.reason?.trim() ? (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                      Reason
                    </dt>
                    <dd className="text-sm text-[var(--color-text-primary)]">
                      {request.reason}
                    </dd>
                  </div>
                ) : null}
                {request.approvalRequestId ? (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                      Approval Request
                    </dt>
                    <dd>
                      <Button
                        type="link"
                        style={{ padding: 0, height: 'auto' }}
                        onClick={() =>
                          router.push(`/approvals/${request.approvalRequestId}`)
                        }
                      >
                        Open in Approvals
                      </Button>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">
          {approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Approval Chain
                </h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  No approval workflow linked.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel leave request?"
        description="This will cancel the leave request and release any pending balance. This cannot be undone."
        confirmLabel="Cancel request"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
