'use client';

import { Alert, Button, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { useOvertimeSheet } from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
  const { t } = useEpcTranslation();
  const currentUser = useCurrentUser();
  const detailQuery = useOvertimeSheet(sourceId);
  const sheet = detailQuery.data;

  if (detailQuery.isLoading && !sheet) {
    return (
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] px-5 py-4">
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
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <Alert
          type="info"
          showIcon
          title="This sheet was returned. Edit entries on the overtime sheet, then resubmit from this page."
        />
      ) : null}

      <SectionCard
        title="Overtime Sheet"
        bodyClassName="px-5 py-4"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={formatOvertimeStatus(sheet.status, t)}
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
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <MetaItem label="Sheet #">{sheet.sheetNumber}</MetaItem>
          <MetaItem label="Employee">
            {formatOvertimeEmployeeName(sheet.employee)}
          </MetaItem>
          <MetaItem label="Period">
            {formatOvertimePeriod(sheet.month, sheet.year, t)}
          </MetaItem>
        </div>
      </SectionCard>

      <SummaryStrip
        items={[
          {
            label: 'Regular',
            value: `${formatOvertimeHours(sheet.totalRegularHours)} hrs`,
          },
          {
            label: 'Night',
            value: `${formatOvertimeHours(sheet.totalNightHours)} hrs`,
          },
          {
            label: 'Weekend',
            value: `${formatOvertimeHours(sheet.totalWeekendHours)} hrs`,
          },
          {
            label: 'Holiday',
            value: `${formatOvertimeHours(sheet.totalHolidayHours)} hrs`,
          },
          {
            label: 'Total',
            value: `${formatOvertimeHours(sheet.totalHours)} hrs`,
            emphasize: true,
          },
        ]}
      />

      <SectionCard title="Entries" bodyClassName="px-5 py-4">
        <Table<OvertimeEntry>
          rowKey="id"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={sheet.entries ?? []}
        />
      </SectionCard>
    </div>
  );
}
