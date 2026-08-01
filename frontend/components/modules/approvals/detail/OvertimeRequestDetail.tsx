'use client';

import { Alert, Descriptions, Skeleton, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { useOvertimeSheet } from '@/lib/query/overtime';
import { tokens } from '@/lib/theme/tokens';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Typed overtime sheet body for Approvals detail (left column).
 */
export default function OvertimeRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useOvertimeSheet(sourceId);
  const sheet = detailQuery.data;

  if (detailQuery.isLoading && !sheet) {
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

  if (detailQuery.isError || !sheet) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Overtime sheet not found'
        }
      />
    );
  }

  const columns: ColumnsType<OvertimeEntry> = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (v: string) => formatProjectDate(v),
    },
    { title: 'Start', dataIndex: 'startTime', key: 'startTime', width: 70 },
    { title: 'End', dataIndex: 'endTime', key: 'endTime', width: 70 },
    {
      title: 'Total',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 70,
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Tasks',
      dataIndex: 'taskDescription',
      key: 'taskDescription',
      ellipsis: true,
    },
  ];

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
          Overtime sheet
        </Typography.Title>
        <StatusBadge
          label={formatOvertimeStatus(sheet.status)}
          variant={overtimeStatusVariant(sheet.status)}
        />
      </div>

      <Descriptions bordered size="small" column={1} className="mb-4">
        <Descriptions.Item label="Sheet #">
          {sheet.sheetNumber}
        </Descriptions.Item>
        <Descriptions.Item label="Employee">
          {formatOvertimeEmployeeName(sheet.employee)}
        </Descriptions.Item>
        <Descriptions.Item label="Period">
          {formatOvertimePeriod(sheet.month, sheet.year)}
        </Descriptions.Item>
        <Descriptions.Item label="Regular">
          {formatOvertimeHours(sheet.totalRegularHours)} hrs
        </Descriptions.Item>
        <Descriptions.Item label="Night">
          {formatOvertimeHours(sheet.totalNightHours)} hrs
        </Descriptions.Item>
        <Descriptions.Item label="Weekend">
          {formatOvertimeHours(sheet.totalWeekendHours)} hrs
        </Descriptions.Item>
        <Descriptions.Item label="Holiday">
          {formatOvertimeHours(sheet.totalHolidayHours)} hrs
        </Descriptions.Item>
        <Descriptions.Item label="Total">
          {formatOvertimeHours(sheet.totalHours)} hrs
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5}>Entries</Typography.Title>
      <Table<OvertimeEntry>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={sheet.entries ?? []}
      />
    </div>
  );
}
