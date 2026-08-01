'use client';

import { Alert, Button, Descriptions, Skeleton, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { useOvertimeSheet } from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
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
 * Typed overtime sheet body for Approvals detail.
 * When RETURNED, links to the sheet page for entry editing.
 */
export default function OvertimeRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const currentUser = useCurrentUser();
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

  const canEdit =
    sheet.status === 'RETURNED' &&
    Boolean(currentUser.data?.id) &&
    sheet.employeeId === currentUser.data?.id;

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
    {
      title: 'Attachments',
      key: 'attachments',
      width: 180,
      render: (_: unknown, row: OvertimeEntry) => (
        <AttachmentDownloadList
          documents={row.documents}
          emptyLabel="—"
        />
      ),
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
        {canEdit ? (
          <Link href={`/hr/overtime/${sheet.id}`}>
            <Button type="primary" size="small">
              Edit entries
            </Button>
          </Link>
        ) : null}
      </div>

      {canEdit ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="This sheet was returned. Edit entries on the overtime sheet, then resubmit from this page."
        />
      ) : null}

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
