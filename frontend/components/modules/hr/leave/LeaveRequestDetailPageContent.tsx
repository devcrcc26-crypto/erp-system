'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Typography,
} from 'antd';
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
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
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
  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={() => router.push('/hr/leave-requests')}
            style={{ paddingInline: 0, marginBottom: 8 }}
          >
            Leave Requests
          </Button>
          <Space wrap align="center" size={12}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {request.requestNumber}
            </Typography.Title>
            <StatusBadge
              label={formatLeaveStatus(request.status)}
              variant={leaveStatusVariant(request.status)}
            />
            <StatusBadge
              label={formatLeaveType(request.leaveType)}
              variant={leaveTypeVariant(request.leaveType)}
            />
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            {formatLeaveEmployeeName(request.employee)}
            {request.submittedAt
              ? ` · Submitted ${formatProjectDate(request.submittedAt)}`
              : null}
          </Typography.Paragraph>
        </div>

        {canCancel ? (
          <Button danger onClick={() => setConfirmCancel(true)}>
            Cancel Request
          </Button>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
          alignItems: 'start',
        }}
        className="max-lg:!grid-cols-1"
      >
        <div
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
            borderRadius: 8,
            padding: 20,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Request details
          </Typography.Title>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Employee">
              {formatLeaveEmployeeName(request.employee)}
            </Descriptions.Item>
            <Descriptions.Item label="Leave type">
              {formatLeaveType(request.leaveType)}
            </Descriptions.Item>
            <Descriptions.Item label="Start date">
              {formatProjectDate(request.startDate)}
            </Descriptions.Item>
            <Descriptions.Item label="End date">
              {formatProjectDate(request.endDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Days">{request.days}</Descriptions.Item>
            <Descriptions.Item label="Reason">
              {request.reason?.trim() || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              {formatLeaveStatus(request.status)}
            </Descriptions.Item>
            {request.approvalRequestId ? (
              <Descriptions.Item label="Approval request">
                <Button
                  type="link"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() =>
                    router.push(`/approvals/${request.approvalRequestId}`)
                  }
                >
                  Open in Approvals
                </Button>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        </div>

        {request.approvalRequest ? (
          <ApprovalTierTimeline
            tiers={tiers}
            currentTier={request.approvalRequest.currentTier ?? 0}
          />
        ) : (
          <aside
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Empty description="No approval workflow linked" />
          </aside>
        )}
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
