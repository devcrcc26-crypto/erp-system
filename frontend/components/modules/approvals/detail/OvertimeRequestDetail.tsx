'use client';

import { useMemo } from 'react';
import { Alert, Button, Skeleton, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  FieldTimeOutlined,
  PaperClipOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import Link from 'next/link';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import OvertimeEditDiffBanner from '@/components/modules/approvals/detail/OvertimeEditDiffBanner';
import OvertimeSiteChips from '@/components/modules/hr/overtime/OvertimeSiteChips';
import TableEmptyState from '@/components/ui/TableEmptyState';
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
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { overtimeSheetDetailHref } from '@/lib/utils/hr-self-service-nav';

import '@/components/modules/hr/overtime/overtime-entries-v2.css';

/**
 * Typed overtime sheet body for Approvals detail.
 * Entries table matches OvertimeSheetDetailPageContent (v2).
 */
export default function OvertimeRequestDetail({
  approvalRequestId,
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

  const columns: ColumnsType<OvertimeEntry> = useMemo(
    () => [
      {
        title: t('hr.table.date'),
        dataIndex: 'date',
        key: 'date',
        width: 150,
        render: (date: string, row: OvertimeEntry) => {
          const day = dayjs(date);
          const kind =
            row.isHoliday || Number(row.holidayHours) > 0
              ? 'holiday'
              : Number(row.weekendHours) > 0
                ? 'weekend'
                : 'workday';
          return (
            <div className="erp-ot-date" data-kind={kind}>
              <span className="erp-ot-date-day" aria-hidden>
                {day.format('DD')}
              </span>
              <span className="erp-ot-date-meta" aria-hidden>
                <strong>{day.format('ddd')}</strong>
                <span>{day.format('MMM YYYY')}</span>
              </span>
              <span className="sr-only">{day.format('dddd, D MMMM YYYY')}</span>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.overtime.timeRange'),
        key: 'time',
        width: 140,
        render: (_: unknown, row: OvertimeEntry) => (
          <div>
            <span className="erp-ot-time">
              {row.startTime}
              <span className="erp-ot-time-arrow" aria-hidden>
                →
              </span>
              <span className="sr-only"> – </span>
              {row.endTime}
            </span>
            {row.isOvernight ? (
              <div className="erp-ot-pills">
                <span className="erp-ot-pill" data-kind="night">
                  {t('pages.hr.overtime.overnight')}
                </span>
              </div>
            ) : null}
            <OvertimeSiteChips entry={row} />
          </div>
        ),
      },
      {
        title: t('pages.hr.overtime.hoursColumn'),
        key: 'hoursBreakdown',
        width: 230,
        render: (_: unknown, row: OvertimeEntry) => {
          const parts = (
            [
              ['regular', row.regularHours],
              ['night', row.nightHours],
              ['weekend', row.weekendHours],
              ['holiday', row.holidayHours],
            ] as const
          ).filter(([, hours]) => Number(hours) > 0);
          return (
            <div>
              <span className="erp-ot-hours-total">
                {formatOvertimeHours(row.totalHours)}h
              </span>
              {parts.length > 0 ? (
                <div className="erp-ot-pills">
                  {parts.map(([kind, hours]) => {
                    const pill = (
                      <span key={kind} className="erp-ot-pill" data-kind={kind}>
                        {formatOvertimeHours(hours)}h{' '}
                        {t(`hr.overtimeCategory.${kind}`)}
                      </span>
                    );
                    return kind === 'holiday' && row.holidayName ? (
                      <Tooltip key={kind} title={row.holidayName}>
                        {pill}
                      </Tooltip>
                    ) : (
                      pill
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('hr.labels.taskDescription'),
        dataIndex: 'taskDescription',
        key: 'taskDescription',
        render: (text: string, row: OvertimeEntry) => {
          const fileCount = row.documents?.length ?? 0;
          return (
            <div className="min-w-[200px]">
              <p
                className={`erp-ot-task${text ? '' : ' erp-ot-task--empty'}`}
                title={text || undefined}
              >
                {text || '—'}
              </p>
              {fileCount > 0 || row.attendanceWarning ? (
                <div className="erp-ot-task-chips">
                  {fileCount > 0 ? (
                    <span className="erp-ot-pill">
                      <PaperClipOutlined aria-hidden />
                      {fileCount === 1
                        ? t('pages.hr.overtime.attachmentsCountOne')
                        : t('pages.hr.overtime.attachmentsCount', {
                            count: fileCount,
                          })}
                    </span>
                  ) : null}
                  {row.attendanceWarning ? (
                    <Tooltip title={row.attendanceWarning}>
                      <span
                        className="erp-ot-pill"
                        data-kind="warning"
                        tabIndex={0}
                      >
                        <WarningOutlined aria-hidden />
                        {t('pages.hr.overtime.attendanceFlag')}
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        },
      },
    ],
    [t],
  );

  if (detailQuery.isLoading && !sheet) {
    return (
      <div className="erp-pro-card px-5 py-6">
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
            : t('hr.messages.overtimeSheetNotFound')
        }
      />
    );
  }

  const isOwner =
    Boolean(currentUser.data?.id) &&
    sheet.employeeId === currentUser.data?.id;
  const canEdit =
    isOwner &&
    !sheet.payrollLocked &&
    (sheet.canEditEntries === true ||
      sheet.status === 'DRAFT' ||
      sheet.status === 'RETURNED' ||
      sheet.status === 'SUBMITTED' ||
      sheet.status === 'IN_REVIEW' ||
      sheet.status === 'APPROVED');
  const showEditedBadge =
    Boolean(sheet.editedAfterApproval) ||
    Boolean(sheet.editDiff?.editedAfterApproval);

  const employeeName = formatOvertimeEmployeeName(sheet.employee);
  const periodLabel = formatOvertimePeriod(sheet.month, sheet.year, t);

  return (
    <div className="flex flex-col gap-4">
      {sheet.status === 'RETURNED' && isOwner ? (
        <Alert
          type="info"
          showIcon
          className="!rounded-xl"
          title="This sheet was returned. Edit entries on the overtime sheet, then submit the sheet again from there."
        />
      ) : null}

      {sheet.payrollLocked ? (
        <Alert
          type="warning"
          showIcon
          className="!rounded-xl"
          title={t('pages.hr.overtime.payrollLockedBanner')}
        />
      ) : null}

      {sheet.editDiff?.editedAfterApproval ? (
        <OvertimeEditDiffBanner editDiff={sheet.editDiff} />
      ) : null}

      {unregisteredHolidayDates.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className="!rounded-xl"
          title={t('hr.overtime.unregisteredHolidayBanner', {
            count: unregisteredHolidayDates.length,
            dates: unregisteredHolidayDates.join(', '),
          })}
        />
      ) : null}

      <div className="erp-pro-card overflow-hidden">
        <div className="erp-ot-entries-header">
          <div className="min-w-0">
            <h3 className="erp-ot-entries-title m-0">
              <span className="erp-users-id-chip">{sheet.sheetNumber}</span>
              <span className="truncate">{employeeName}</span>
            </h3>
            <p className="erp-users-cell-sub m-0 mt-1">{periodLabel}</p>
          </div>
          <div className="erp-ot-entries-actions">
            <StatusBadge
              label={formatOvertimeStatus(sheet.status, t)}
              variant={overtimeStatusVariant(sheet.status)}
            />
            {showEditedBadge ? (
              <Tag color="orange" className="!m-0 rounded-lg">
                {t('pages.hr.overtime.resubmittedBadge')}
              </Tag>
            ) : null}
            {canEdit ? (
              <Link
                href={overtimeSheetDetailHref(
                  sheet.id,
                  `/approvals/${approvalRequestId}`,
                )}
              >
                <Button type="primary" size="small">
                  {t('common.update')}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {(
          [
            {
              label: t('hr.overtimeCategory.regular'),
              value: sheet.totalRegularHours,
              color: 'text-blue-700',
            },
            {
              label: t('hr.overtimeCategory.night'),
              value: sheet.totalNightHours,
              color: 'text-violet-700',
            },
            {
              label: t('hr.overtimeCategory.weekend'),
              value: sheet.totalWeekendHours,
              color: 'text-amber-700',
            },
            {
              label: t('hr.overtimeCategory.holiday'),
              value: sheet.totalHolidayHours,
              color: 'text-red-700',
            },
            {
              label: t('hr.overtimeCategory.total'),
              value: sheet.totalHours,
              color: 'text-[#0f6e56]',
              total: true,
            },
          ] as const
        ).map((item) => {
          const hours = Number(item.value);
          const isTotal = 'total' in item && item.total;
          return (
            <div
              key={item.label}
              className={`rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] ${
                isTotal ? 'bg-[#f0faf6]' : 'bg-white'
              }`}
            >
              <p className="m-0 text-xs font-semibold tracking-[0.06em] text-gray-600 uppercase">
                {item.label}
              </p>
              <p
                className={`m-0 mt-1 font-semibold tabular-nums ${isTotal ? 'text-2xl' : 'text-xl'} ${
                  hours > 0 ? item.color : 'text-gray-400'
                }`}
              >
                {hours > 0 ? `${formatOvertimeHours(hours)}h` : '-'}
              </p>
            </div>
          );
        })}
      </div>

      <section
        className="erp-pro-card erp-ot-entries min-w-0"
        aria-labelledby="approval-ot-entries-title"
      >
        <div className="erp-ot-entries-header">
          <h3 id="approval-ot-entries-title" className="erp-ot-entries-title">
            {t('hr.section.entries')}
            <span className="erp-ot-entries-count">
              {(sheet.entries?.length ?? 0).toLocaleString()}
            </span>
          </h3>
        </div>
        <DataTable<OvertimeEntry>
          rowKey="id"
          className="erp-pro-table erp-users-table"
          size="middle"
          columns={columns}
          dataSource={sheet.entries ?? []}
          pagination={false}
          scroll={{ x: 760 }}
          expandable={{
            expandedRowRender: (entry) => (
              <div className="erp-ot-expanded">
                <p className="erp-ot-expanded-title">
                  {t('hr.section.attachments')}
                </p>
                <AttachmentDownloadList documents={entry.documents} />
              </div>
            ),
            rowExpandable: (entry) => (entry.documents?.length ?? 0) > 0,
          }}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FieldTimeOutlined />}
                title={t('pages.hr.overtime.entriesEmptyTitle')}
                description={t('hr.empty.noEntries')}
              />
            ),
          }}
        />
      </section>
    </div>
  );
}
