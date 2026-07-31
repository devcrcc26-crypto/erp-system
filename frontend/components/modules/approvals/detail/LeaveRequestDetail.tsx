'use client';

import { Alert, Descriptions, Skeleton, Typography } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useLeaveRequest } from '@/lib/query/leave';
import { tokens } from '@/lib/theme/tokens';
import {
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Typed leave body for Approvals detail (left column).
 */
export default function LeaveRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useLeaveRequest(sourceId);
  const leave = detailQuery.data;

  if (detailQuery.isLoading && !leave) {
    return (
      <div
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
          padding: 24,
        }}
      >
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (detailQuery.isError || !leave) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Leave request not found'
        }
      />
    );
  }

  const balance = leave.balance;

  return (
    <div
      style={{
        background: tokens.colorCardBg,
        border: `1px solid ${tokens.colorBorder}`,
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Leave request
        </Typography.Title>
        <StatusBadge
          label={formatLeaveStatus(leave.status)}
          variant={leaveStatusVariant(leave.status)}
        />
        <StatusBadge
          label={formatLeaveType(leave.leaveType)}
          variant={leaveTypeVariant(leave.leaveType)}
        />
      </div>

      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Employee">
          {formatLeaveEmployeeName(leave.employee)}
        </Descriptions.Item>
        <Descriptions.Item label="Leave type">
          {formatLeaveType(leave.leaveType)}
        </Descriptions.Item>
        <Descriptions.Item label="Start date">
          {formatProjectDate(leave.startDate)}
        </Descriptions.Item>
        <Descriptions.Item label="End date">
          {formatProjectDate(leave.endDate)}
        </Descriptions.Item>
        <Descriptions.Item label="Days">{leave.days}</Descriptions.Item>
        <Descriptions.Item label="Reason">
          {leave.reason?.trim() || '—'}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Leave balance
      </Typography.Title>
      {balance ? (
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Entitled">
            {balance.entitled}
          </Descriptions.Item>
          <Descriptions.Item label="Used">{balance.used}</Descriptions.Item>
          <Descriptions.Item label="Pending">
            {balance.pending}
          </Descriptions.Item>
          <Descriptions.Item label="Remaining">
            <Typography.Text strong>{balance.remaining}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">
          Balance unavailable for this leave type.
        </Typography.Text>
      )}
    </div>
  );
}
