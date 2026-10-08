'use client';

import { Alert, Button, Skeleton, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
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
  unregisteredHolidayDatesFromFormData,
} from '@/lib/utils/overtime-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Typed overtime sheet body for Approvals detail.
 * When RETURNED, links to the sheet page for entry editing.
 */
export default function OvertimeRequestDetail({
  sourceId,
  formData,
}: {
  approvalRequestId: string;
  sourceId: string;
  formData?: Record<string, unknown> | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const currentUser = useCurrentUser();
  const detailQuery = useOvertimeSheet(sourceId);
  const sheet = detailQuery.data;
  const unregisteredHolidayDates = unregisteredHolidayDatesFromFormData(
    formData ?? sheet?.approvalRequest?.formData,
  );

  if (detailQuery.isLoading && !sheet) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] px-3 py-4 sm:px-5">
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

  const hourColumn = (
    key: 'regularHours' | 'nightHours' | 'weekendHours' | 'holidayHours',
    title: string,
  ): ColumnsType<OvertimeEntry>[number] => ({
    title,
    dataIndex: key,
    key,
    width: 84,
    align: 'right',
    responsive: ['lg'],
    render: (v: number, row: OvertimeEntry) => {
      const hours = (
        <span className="tabular-nums">{formatOvertimeHours(v)}</span>
      );
      return key === 'holidayHours' && row.holidayName ? (
        <Tooltip title={row.holidayName}>{hours}</Tooltip>
      ) : (
        hours
      );
    },
  });

  const columns: ColumnsType<OvertimeEntry> = [
    {
      title: t('hr.table.date'),
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (v: string, row: OvertimeEntry) => (
        <div className="min-w-0">
          <span className="whitespace-nowrap">{formatProjectDate(v)}</span>
          <p className="erp-users-cell-sub m-0 mt-0.5 whitespace-nowrap tabular-nums">
            {row.startTime} – {row.endTime}
            {row.isOvernight ? ' (+1)' : ''}
          </p>
        </div>
      ),
    },
    {
      title: t('hr.labels.taskDescription'),
      dataIndex: 'taskDescription',
      key: 'taskDescription',
      render: (value: string) => (
        <div className="min-w-[180px] whitespace-pre-wrap break-words">
          {value?.trim() || '—'}
        </div>
      ),
    },
    hourColumn('regularHours', t('hr.overtimeCategory.regular')),
    hourColumn('nightHours', t('hr.overtimeCategory.night')),
    hourColumn('weekendHours', t('hr.overtimeCategory.weekend')),
    hourColumn('holidayHours', t('hr.overtimeCategory.holiday')),
    {
      title: t('hr.overtimeCategory.total'),
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 84,
      align: 'right',
      render: (v: number) => (
        <span className="erp-users-cell-strong tabular-nums whitespace-nowrap">
          {formatOvertimeHours(v)}
        </span>
      ),
    },
    {
      title: t('hr.labels.attachments'),
      key: 'attachments',
      width: 110,
      render: (_: unknown, row: OvertimeEntry) => (
        <AttachmentDownloadList
          documents={row.documents}
          emptyLabel="—"
          compact
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <Alert
          type="info"
          showIcon
          title="This sheet was returned. Edit entries on the overtime sheet, then resubmit from this page."
        />
      ) : null}

      {unregisteredHolidayDates.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('hr.overtime.unregisteredHolidayBanner', {
            count: unregisteredHolidayDates.length,
            dates: unregisteredHolidayDates.join(', '),
          })}
        />
      ) : null}

      <SectionCard
        title="Overtime Sheet"
        bodyClassName="px-3 py-4 sm:px-5"
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
            label: t('hr.overtimeCategory.regular'),
            value: `${formatOvertimeHours(sheet.totalRegularHours)} hrs`,
          },
          {
            label: t('hr.overtimeCategory.night'),
            value: `${formatOvertimeHours(sheet.totalNightHours)} hrs`,
          },
          {
            label: t('hr.overtimeCategory.weekend'),
            value: `${formatOvertimeHours(sheet.totalWeekendHours)} hrs`,
          },
          {
            label: t('hr.overtimeCategory.holiday'),
            value: `${formatOvertimeHours(sheet.totalHolidayHours)} hrs`,
          },
          {
            label: t('hr.overtimeCategory.total'),
            value: `${formatOvertimeHours(sheet.totalHours)} hrs`,
            emphasize: true,
          },
        ]}
      />

      <SectionCard title="Entries" bodyClassName="px-3 py-4 sm:px-5">
        <DataTable<OvertimeEntry>
          rowKey="id"
          className="erp-pro-table"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={sheet.entries ?? []}
        />
      </SectionCard>
    </div>
  );
}
