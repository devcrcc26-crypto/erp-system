'use client';

import { useMemo, useState } from 'react';
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
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  useCancelOvertimeRequest,
  useOvertimeRequest,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  formatOvertimeCompensation,
  formatOvertimeEmployeeName,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Overtime request detail with approval tier sidebar.
 */
export default function OvertimeRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useOvertimeRequest(requestId);
  const cancelMutation = useCancelOvertimeRequest(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const request = detailQuery.data;
  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(request) &&
    Boolean(currentUser.data?.id) &&
    request?.employeeId === currentUser.data?.id &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Overtime request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel overtime request', messageApi);
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
            : 'Overtime request not found'
        }
        action={
          <Button onClick={() => router.push('/hr/overtime')}>
            Back to list
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={() => router.push('/hr/overtime')}
            style={{ paddingInline: 0, marginBottom: 8 }}
          >
            Overtime
          </Button>
          <Space wrap align="center" size={12}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {request.requestNumber}
            </Typography.Title>
            <StatusBadge
              label={formatOvertimeStatus(request.status)}
              variant={overtimeStatusVariant(request.status)}
            />
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            {formatOvertimeEmployeeName(request.employee)}
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
              {formatOvertimeEmployeeName(request.employee)}
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {formatProjectDate(request.date)}
            </Descriptions.Item>
            <Descriptions.Item label="Start time">
              {request.startTime}
            </Descriptions.Item>
            <Descriptions.Item label="End time">
              {request.endTime}
            </Descriptions.Item>
            <Descriptions.Item label="Hours">{request.hours}</Descriptions.Item>
            <Descriptions.Item label="Reason">
              {request.reason?.trim() || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Project">
              {request.project ? (
                <Button
                  type="link"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() =>
                    router.push(`/projects/${request.project!.id}`)
                  }
                >
                  {request.project.projectCode} — {request.project.name}
                </Button>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Compensation">
              {formatOvertimeCompensation(request.compensationType)}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              {formatOvertimeStatus(request.status)}
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
        title="Cancel overtime request?"
        description="This will cancel the overtime request and its approval workflow. This cannot be undone."
        confirmLabel="Cancel request"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
