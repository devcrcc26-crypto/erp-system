'use client';

import { Alert, Descriptions, Skeleton, Typography } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useOvertimeRequest } from '@/lib/query/overtime';
import { tokens } from '@/lib/theme/tokens';
import {
  formatOvertimeCompensation,
  formatOvertimeEmployeeName,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Typed overtime body for Approvals detail (left column).
 */
export default function OvertimeRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useOvertimeRequest(sourceId);
  const overtime = detailQuery.data;

  if (detailQuery.isLoading && !overtime) {
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

  if (detailQuery.isError || !overtime) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Overtime request not found'
        }
      />
    );
  }

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
          Overtime request
        </Typography.Title>
        <StatusBadge
          label={formatOvertimeStatus(overtime.status)}
          variant={overtimeStatusVariant(overtime.status)}
        />
      </div>

      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Employee">
          {formatOvertimeEmployeeName(overtime.employee)}
        </Descriptions.Item>
        <Descriptions.Item label="Date">
          {formatProjectDate(overtime.date)}
        </Descriptions.Item>
        <Descriptions.Item label="Start time">
          {overtime.startTime}
        </Descriptions.Item>
        <Descriptions.Item label="End time">
          {overtime.endTime}
        </Descriptions.Item>
        <Descriptions.Item label="Hours">{overtime.hours}</Descriptions.Item>
        <Descriptions.Item label="Reason">{overtime.reason}</Descriptions.Item>
        <Descriptions.Item label="Project">
          {overtime.project
            ? `${overtime.project.projectCode} — ${overtime.project.name}`
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Compensation">
          {formatOvertimeCompensation(overtime.compensationType)}
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
