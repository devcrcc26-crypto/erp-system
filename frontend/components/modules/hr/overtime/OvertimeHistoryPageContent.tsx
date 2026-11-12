'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Select, Skeleton, Spin } from 'antd';
import { ArrowLeft, Clock } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import '@/components/modules/approvals/approvals-v2.css';
import '@/components/modules/users/employees-v2.css';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  OvertimeSheetListItem,
  OvertimeSheetStatus,
} from '@/lib/api/overtime.types';
import { useOvertimeSheetsAll } from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { useUser } from '@/lib/query/users';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { overtimeSheetDetailHref } from '@/lib/utils/hr-self-service-nav';
import {
  myOvertimeHistoryPath,
  overtimeHistoryPath,
} from '@/lib/utils/overtime-history-path';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

// No LIST_PAGE_V2: employees-v2.css carries the brand look.
const HISTORY_ROOT =
  'erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-approvals-page erp-approvals-v2 flex flex-col';
const HISTORY_PAGE_SIZE = 15;

export type OvertimeHistoryPageMode = 'self' | 'employee';

interface OvertimeHistoryPageContentProps {
  mode: OvertimeHistoryPageMode;
  /** Required when mode is `employee`. */
  employeeId?: string;
}

type YearTotals = {
  regular: number;
  night: number;
  weekend: number;
  holiday: number;
  total: number;
  sheets: number;
};

function emptyTotals(): YearTotals {
  return {
    regular: 0,
    night: 0,
    weekend: 0,
    holiday: 0,
    total: 0,
    sheets: 0,
  };
}

function sumYearTotals(sheets: OvertimeSheetListItem[], year: number): YearTotals {
  const totals = emptyTotals();
  for (const sheet of sheets) {
    if (sheet.year !== year || sheet.status === 'CANCELLED') {
      continue;
    }
    totals.regular += sheet.totalRegularHours;
    totals.night += sheet.totalNightHours;
    totals.weekend += sheet.totalWeekendHours;
    totals.holiday += sheet.totalHolidayHours;
    totals.total += sheet.totalHours;
    totals.sheets += 1;
  }
  return totals;
}

function HoursTile({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div
      className="rounded-md p-3"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <p
        className="m-0 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 mt-2 text-2xl font-semibold tabular-nums"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Independent overtime year totals + sheet history for one employee (or self).
 */
export default function OvertimeHistoryPageContent({
  mode,
  employeeId,
}: OvertimeHistoryPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const currentUserQuery = useCurrentUser();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [historyPage, setHistoryPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    OvertimeSheetStatus | undefined
  >();

  const isSelf = mode === 'self';
  const targetEmployeeId = isSelf ? undefined : employeeId;
  const employeeEnabled = Boolean(targetEmployeeId);
  const isOwnEmployeePage =
    !isSelf &&
    Boolean(targetEmployeeId) &&
    targetEmployeeId === currentUserQuery.data?.id;

  const allowed = isSelf || canViewHr || isOwnEmployeePage;

  const detailReturnTo = useMemo((): string => {
    if (isSelf) {
      return myOvertimeHistoryPath();
    }
    if (targetEmployeeId) {
      return overtimeHistoryPath(targetEmployeeId);
    }
    return myOvertimeHistoryPath();
  }, [isSelf, targetEmployeeId]);

  const employeeQuery = useUser(
    targetEmployeeId ?? '',
    !isSelf && employeeEnabled && allowed,
  );

  const mySheetsQuery = useOvertimeSheetsAll({}, isSelf && allowed);
  const employeeSheetsQuery = useOvertimeSheetsAll(
    { employeeId: targetEmployeeId },
    !isSelf && employeeEnabled && canViewHr && allowed,
  );
  const ownSheetsAsEmployeeQuery = useOvertimeSheetsAll(
    {},
    Boolean(isOwnEmployeePage && !canViewHr && allowed),
  );

  const historyQuery = isSelf
    ? mySheetsQuery
    : canViewHr
      ? employeeSheetsQuery
      : ownSheetsAsEmployeeQuery;

  const displayName = useMemo(() => {
    if (isSelf) {
      const me = currentUserQuery.data;
      return me ? formatUserName(me) : t('pages.hr.overtimeHistory.you');
    }
    if (employeeQuery.data) {
      return formatUserName(employeeQuery.data);
    }
    const first = historyQuery.data?.[0]?.employee;
    if (first) {
      return formatOvertimeEmployeeName(first);
    }
    return t('hr.placeholder.employee');
  }, [
    isSelf,
    currentUserQuery.data,
    employeeQuery.data,
    historyQuery.data,
    t,
  ]);

  const allHistory = useMemo(() => {
    const rows = historyQuery.data ?? [];
    return [...rows].sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      if (a.month !== b.month) {
        return b.month - a.month;
      }
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [historyQuery.data]);

  const yearTotals = useMemo(
    () => sumYearTotals(allHistory, year),
    [allHistory, year],
  );

  const filteredHistory = useMemo(() => {
    return allHistory.filter((row) => {
      if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [allHistory, statusFilter]);

  const historyMeta = useMemo(() => {
    const total = filteredHistory.length;
    const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE) || 1);
    const page = Math.min(historyPage, pages);
    return { total, page, limit: HISTORY_PAGE_SIZE, pages };
  }, [filteredHistory.length, historyPage]);

  const historyRows = useMemo(() => {
    const start = (historyMeta.page - 1) * historyMeta.limit;
    return filteredHistory.slice(start, start + historyMeta.limit);
  }, [filteredHistory, historyMeta.page, historyMeta.limit]);

  const statusOptions = useMemo(
    () =>
      (
        [
          'DRAFT',
          'SUBMITTED',
          'IN_REVIEW',
          'APPROVED',
          'REJECTED',
          'RETURNED',
          'CANCELLED',
        ] as OvertimeSheetStatus[]
      ).map((value) => ({
        value,
        label: formatOvertimeStatus(value, t),
      })),
    [t],
  );

  const columns: ColumnsType<OvertimeSheetListItem> = useMemo(
    () => [
      {
        title: t('hr.table.sheetNumber'),
        dataIndex: 'sheetNumber',
        key: 'sheetNumber',
        width: 140,
        render: (value: string) => (
          <span className="font-medium tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.period'),
        key: 'period',
        width: 140,
        render: (_: unknown, row: OvertimeSheetListItem) =>
          formatOvertimePeriod(row.month, row.year, t),
      },
      {
        title: t('hr.overtimeCategory.regular'),
        dataIndex: 'totalRegularHours',
        key: 'totalRegularHours',
        width: 88,
        align: 'right',
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.overtimeCategory.night'),
        dataIndex: 'totalNightHours',
        key: 'totalNightHours',
        width: 88,
        align: 'right',
        responsive: ['md'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.overtimeCategory.weekend'),
        dataIndex: 'totalWeekendHours',
        key: 'totalWeekendHours',
        width: 88,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.overtimeCategory.holiday'),
        dataIndex: 'totalHolidayHours',
        key: 'totalHolidayHours',
        width: 88,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.table.totalHours'),
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 96,
        align: 'right',
        render: (value: number) => (
          <span className="font-medium tabular-nums">
            {formatOvertimeHours(value)}
          </span>
        ),
      },
      {
        title: t('common.status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: OvertimeSheetStatus) => (
          <StatusBadge
            label={formatOvertimeStatus(value, t)}
            variant={overtimeStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.submittedDate'),
        dataIndex: 'submittedAt',
        key: 'submittedAt',
        width: 120,
        responsive: ['md'],
        render: (value: string | null | undefined) =>
          value ? formatProjectDate(value) : '-',
      },
    ],
    [t],
  );

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('hr.overtime.profileLoadError');
  }

  function handleBack(): void {
    if (isSelf) {
      router.push('/profile');
      return;
    }
    if (targetEmployeeId) {
      router.push(`/users/${targetEmployeeId}`);
      return;
    }
    router.push('/hr/overtime');
  }

  if (!isSelf && !employeeId) {
    return (
      <Alert type="error" showIcon title={t('hr.overtime.profileLoadError')} />
    );
  }

  if (!allowed) {
    return (
      <div className={HISTORY_ROOT}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (
    !isSelf &&
    employeeQuery.isLoading &&
    !employeeQuery.data &&
    canViewHr
  ) {
    return (
      <div className={HISTORY_ROOT}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div className={HISTORY_ROOT}>
      <section
        className="erp-approvals-hero"
        aria-labelledby="erp-overtime-history-hero-title"
      >
        <div className="erp-approvals-hero-top">
          <div className="erp-approvals-hero-heading min-w-0">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={handleBack}
              className="!mb-2 !px-2 !text-white/90 hover:!text-white"
            >
              {t('hr.buttons.back')}
            </Button>
            <h2
              id="erp-overtime-history-hero-title"
              className="erp-approvals-hero-title break-words"
            >
              {displayName}
            </h2>
            <p className="erp-approvals-hero-subtitle">
              {t('hr.overtime.historyTitle')}
            </p>
          </div>
        </div>
      </section>

      <div className="erp-users-stat-bar">
          {[
            { label: t('hr.table.year'), value: String(year) },
            {
              label: t('hr.overtimeCategory.total'),
              value: formatOvertimeHours(yearTotals.total),
            },
            {
              label: t('hr.table.items'),
              value: String(yearTotals.sheets),
            },
          ].map((item) => (
            <div key={item.label} className="erp-users-stat">
              <div className="min-w-0 text-left">
                <p className="erp-users-stat-label">{item.label}</p>
                <p className="erp-users-stat-value">{item.value}</p>
              </div>
            </div>
          ))}
      </div>

      <div className="erp-pro-card erp-approvals-table-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <Clock size={18} />
            </span>
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.overtime.yearSummaryTitle')}
            </h3>
          </div>
          <div className="erp-users-toolbar-actions flex items-center gap-2">
            <span
              className="text-xs"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('hr.table.year')}
            </span>
            <InputNumber
              min={2000}
              max={2100}
              value={year}
              onChange={(value) => {
                if (typeof value === 'number') {
                  setYear(value);
                }
              }}
              size="small"
              style={{ width: 96 }}
            />
          </div>
        </div>
        <div className="p-4">
          {historyQuery.isError ? (
            <Alert
              type="error"
              showIcon
              title={errorMessage(historyQuery.error)}
            />
          ) : historyQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <HoursTile
                label={t('hr.overtimeCategory.regular')}
                value={formatOvertimeHours(yearTotals.regular)}
              />
              <HoursTile
                label={t('hr.overtimeCategory.night')}
                value={formatOvertimeHours(yearTotals.night)}
              />
              <HoursTile
                label={t('hr.overtimeCategory.weekend')}
                value={formatOvertimeHours(yearTotals.weekend)}
              />
              <HoursTile
                label={t('hr.overtimeCategory.holiday')}
                value={formatOvertimeHours(yearTotals.holiday)}
              />
              <HoursTile
                label={t('hr.overtimeCategory.total')}
                value={formatOvertimeHours(yearTotals.total)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="erp-pro-card erp-approvals-table-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <Clock size={18} />
            </span>
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.overtime.historyTitle')}
            </h3>
          </div>
        </div>
        <div className="erp-users-filter-bar">
          <Select
            allowClear
            placeholder={t('common.status')}
            className="w-full min-w-0 sm:w-40"
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setHistoryPage(1);
            }}
          />
        </div>

        {historyQuery.isError ? (
          <div className="p-4">
            <Alert
              type="error"
              showIcon
              title={errorMessage(historyQuery.error)}
            />
          </div>
        ) : (
          <div className="erp-pro-table-card-body">
            <DataTable<OvertimeSheetListItem>
              rowKey="id"
              className="erp-pro-table erp-users-table"
              size="small"
              loading={historyQuery.isLoading}
              columns={columns}
              dataSource={historyRows}
              onRow={(record) => ({
                onClick: () =>
                  router.push(
                    overtimeSheetDetailHref(record.id, detailReturnTo),
                  ),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: historyMeta.page,
                pageSize: historyMeta.limit,
                total: historyMeta.total,
                showSizeChanger: false,
                onChange: (page) => setHistoryPage(page),
              }}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<Clock />}
                    title={t('hr.overtime.noHistory')}
                  />
                ),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
