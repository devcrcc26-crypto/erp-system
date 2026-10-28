'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ProfileContractPeriodSelect from '@/components/modules/profile/ProfileContractPeriodSelect';
import {
  useCanCreateOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProfileContractPeriod } from '@/hooks/use-profile-contract-period';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  OvertimeSheetListItem,
  OvertimeSheetStatus,
} from '@/lib/api/overtime.types';
import { useOvertimeSheetsAll } from '@/lib/query/overtime';
import {
  monthOverlapsContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';
import {
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { overtimeSheetDetailHref } from '@/lib/utils/hr-self-service-nav';
import { overtimeHistoryPath, myOvertimeHistoryPath } from '@/lib/utils/overtime-history-path';
import { formatProjectDate } from '@/lib/utils/project-display';

const HISTORY_PAGE_SIZE = 10;

export type EmployeeOvertimeProfileMode = 'self' | 'employee';

interface EmployeeOvertimeProfileSectionProps {
  mode: EmployeeOvertimeProfileMode;
  /**
   * Required in both modes. The sheet list is always filtered to this id so
   * a viewer with company-wide overtime access still sees only this employee.
   */
  employeeId?: string;
  /** Hide the "Start this month's overtime" button (read-only My Profile). */
  hideCreateAction?: boolean;
  /**
   * Show every hour category as its own column:
   * Sheet #, Period, Regular, Night, Weekend, Holiday, Total, Status.
   */
  showCategoryColumns?: boolean;
  contractPeriod?: ProfileContractPeriod | null;
  contractPeriods?: ProfileContractPeriod[];
  contractPeriodLoading?: boolean;
  onContractPeriodChange?: (contractId: string) => void;
  hidePeriodControl?: boolean;
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

function sumSheetTotals(sheets: OvertimeSheetListItem[]): YearTotals {
  const totals = emptyTotals();
  for (const sheet of sheets) {
    if (sheet.status === 'CANCELLED') {
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

function OvertimeProfileSection({
  title,
  action,
  children,
  bodyClassName = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {action ? <div className="erp-employee-section-extra">{action}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function HoursTile({
  label,
  value,
  accent,
  meta,
}: {
  label: string;
  value: string;
  accent: string;
  meta?: string;
}): React.ReactNode {
  return (
    <article className="erp-leave-balance-card">
      <div className="erp-leave-balance-card-head">
        <span
          className="erp-leave-balance-dot"
          style={{ background: accent }}
          aria-hidden
        />
        <p className="erp-leave-balance-label">{label}</p>
      </div>
      <p className="erp-leave-balance-value">
        <span
          className="erp-leave-balance-remaining"
          style={{ color: '#0f172a' }}
        >
          {value}
        </span>
      </p>
      {meta ? <p className="erp-leave-balance-meta">{meta}</p> : null}
    </article>
  );
}

/**
 * Year overtime totals and sheet history for a profile surface.
 * Use `self` on My Profile (pass the signed-in user's id); use `employee` on
 * HR employee detail. Both modes list only that employee's sheets.
 */
export default function EmployeeOvertimeProfileSection({
  mode,
  employeeId,
  hideCreateAction = false,
  showCategoryColumns = false,
  contractPeriod: contractPeriodProp,
  contractPeriods: contractPeriodsProp,
  contractPeriodLoading: contractPeriodLoadingProp,
  onContractPeriodChange,
  hidePeriodControl = false,
}: EmployeeOvertimeProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const canCreateOvertime = useCanCreateOvertime();
  const [historyPage, setHistoryPage] = useState(1);

  const isSelf = mode === 'self';
  const targetEmployeeId = employeeId;
  const employeeEnabled = Boolean(targetEmployeeId);

  const localPeriod = useProfileContractPeriod({
    mode,
    employeeId: targetEmployeeId,
    enabled: employeeEnabled && contractPeriodProp === undefined,
  });
  const selectedPeriod =
    contractPeriodProp !== undefined
      ? contractPeriodProp
      : localPeriod.selected;
  const periodOptions = contractPeriodsProp ?? localPeriod.periods;
  const periodsLoading =
    contractPeriodLoadingProp ?? localPeriod.isLoading;

  const detailReturnTo = useMemo((): string => {
    if (isSelf) {
      return '/profile?tab=overtime';
    }
    if (targetEmployeeId) {
      return `/users/${encodeURIComponent(targetEmployeeId)}?tab=leave`;
    }
    return '/profile?tab=overtime';
  }, [isSelf, targetEmployeeId]);

  const sheetsQuery = useOvertimeSheetsAll(
    { employeeId: targetEmployeeId },
    employeeEnabled,
  );

  const historyLoading = sheetsQuery.isLoading || periodsLoading;
  const historyError = sheetsQuery.error;

  const allHistory = useMemo(() => {
    const rows = sheetsQuery.data ?? [];
    const filtered =
      selectedPeriod != null
        ? rows.filter((sheet) =>
            monthOverlapsContractPeriod(
              sheet.year,
              sheet.month,
              selectedPeriod,
            ),
          )
        : rows;
    return [...filtered].sort((a, b) => {
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
  }, [sheetsQuery.data, selectedPeriod]);

  const yearTotals = useMemo(() => sumSheetTotals(allHistory), [allHistory]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedPeriod?.id]);

  const historyMeta = useMemo(() => {
    const total = allHistory.length;
    const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE) || 1);
    const page = Math.min(historyPage, pages);
    return { total, page, limit: HISTORY_PAGE_SIZE, pages };
  }, [allHistory.length, historyPage]);

  const historyRows = useMemo(() => {
    const start = (historyMeta.page - 1) * historyMeta.limit;
    return allHistory.slice(start, start + historyMeta.limit);
  }, [allHistory, historyMeta.page, historyMeta.limit]);

  const columns: ColumnsType<OvertimeSheetListItem> = useMemo(() => {
    const sheetColumn: ColumnsType<OvertimeSheetListItem>[number] = {
      title: t('hr.table.sheetNumber'),
      dataIndex: 'sheetNumber',
      key: 'sheetNumber',
      width: 140,
      render: (value: string) => (
        <span className="erp-users-id-chip">{value}</span>
      ),
    };
    const periodColumn: ColumnsType<OvertimeSheetListItem>[number] = {
      title: t('hr.table.period'),
      key: 'period',
      width: 140,
      render: (_: unknown, row: OvertimeSheetListItem) => (
        <span className="erp-users-cell-strong">
          {formatOvertimePeriod(row.month, row.year, t)}
        </span>
      ),
    };
    const statusColumn: ColumnsType<OvertimeSheetListItem>[number] = {
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
    };

    if (showCategoryColumns) {
      const hoursColumn = (
        dataIndex:
          | 'totalRegularHours'
          | 'totalNightHours'
          | 'totalWeekendHours'
          | 'totalHolidayHours'
          | 'totalHours',
        title: string,
        strong = false,
      ): ColumnsType<OvertimeSheetListItem>[number] => ({
        title,
        dataIndex,
        key: dataIndex,
        width: strong ? 104 : 88,
        align: 'right',
        // Category columns hide on phones; the year summary cards show them.
        responsive: strong ? undefined : ['md'],
        render: (value: number) => (
          <span
            className={`${strong ? 'erp-users-cell-strong' : 'erp-users-cell-sub'} tabular-nums`}
          >
            {formatOvertimeHours(value)}
          </span>
        ),
      });
      return [
        sheetColumn,
        periodColumn,
        hoursColumn('totalRegularHours', t('hr.overtimeCategory.regular')),
        hoursColumn('totalNightHours', t('hr.overtimeCategory.night')),
        hoursColumn('totalWeekendHours', t('hr.overtimeCategory.weekend')),
        hoursColumn('totalHolidayHours', t('hr.overtimeCategory.holiday')),
        hoursColumn('totalHours', t('hr.table.totalHours'), true),
        statusColumn,
      ];
    }

    return [
      sheetColumn,
      periodColumn,
      {
        title: t('hr.table.totalHours'),
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 96,
        align: 'right',
        render: (value: number) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatOvertimeHours(value)}
          </span>
        ),
      },
      {
        title: t('hr.overtimeCategory.regular'),
        dataIndex: 'totalRegularHours',
        key: 'totalRegularHours',
        width: 88,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">
            {formatOvertimeHours(value)}
          </span>
        ),
      },
      statusColumn,
      {
        title: t('hr.table.submittedDate'),
        dataIndex: 'submittedAt',
        key: 'submittedAt',
        width: 120,
        responsive: ['md'],
        render: (value: string | null | undefined) => (
          <span className="erp-users-cell-sub">
            {value ? formatProjectDate(value) : '-'}
          </span>
        ),
      },
    ];
  }, [t, showCategoryColumns]);

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('hr.overtime.profileLoadError');
  }

  function handleViewAll(): void {
    if (targetEmployeeId) {
      router.push(overtimeHistoryPath(targetEmployeeId));
    }
  }

  function handleOpenThisMonth(): void {
    router.push('/approvals/new/overtime');
  }

  const historyAction = isSelf ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="link"
        size="small"
        className="!px-0"
        onClick={() => router.push(myOvertimeHistoryPath())}
      >
        {t('hr.overtime.viewAllHistory')}
      </Button>
      {canCreateOvertime && !hideCreateAction ? (
        <Button type="primary" size="small" onClick={handleOpenThisMonth}>
          {t('hr.buttons.thisMonthSheet')}
        </Button>
      ) : null}
    </div>
  ) : canViewHr ? (
    <Button type="link" size="small" className="!px-0" onClick={handleViewAll}>
      {t('hr.overtime.viewAllHistory')}
    </Button>
  ) : null;

  if (!employeeId) {
    return null;
  }

  const periodControl = hidePeriodControl ? null : (
    <ProfileContractPeriodSelect
      periods={periodOptions}
      value={selectedPeriod?.id ?? null}
      loading={periodsLoading}
      onChange={(id) => {
        if (onContractPeriodChange) {
          onContractPeriodChange(id);
        } else {
          localPeriod.setSelectedId(id);
        }
      }}
    />
  );

  return (
    <div className="erp-leave-profile erp-overtime-profile">
      <OvertimeProfileSection
        title={t('hr.overtime.yearSummaryTitle')}
        action={periodControl}
      >
        {historyError ? (
          <Alert type="error" showIcon title={errorMessage(historyError)} />
        ) : historyLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <div className="erp-leave-balance-grid">
            <HoursTile
              label={t('hr.overtimeCategory.regular')}
              value={formatOvertimeHours(yearTotals.regular)}
              accent="#1d9e75"
            />
            <HoursTile
              label={t('hr.overtimeCategory.night')}
              value={formatOvertimeHours(yearTotals.night)}
              accent="#2563eb"
            />
            <HoursTile
              label={t('hr.overtimeCategory.weekend')}
              value={formatOvertimeHours(yearTotals.weekend)}
              accent="#7c3aed"
            />
            <HoursTile
              label={t('hr.overtimeCategory.holiday')}
              value={formatOvertimeHours(yearTotals.holiday)}
              accent="#be185d"
            />
            <HoursTile
              label={t('hr.overtimeCategory.total')}
              value={formatOvertimeHours(yearTotals.total)}
              accent="#0f6e56"
              meta={t('hr.overtime.sheetsInYear', {
                count: yearTotals.sheets,
              })}
            />
          </div>
        )}
      </OvertimeProfileSection>

      <OvertimeProfileSection
        title={t('hr.overtime.historyTitle')}
        action={historyAction}
        bodyClassName="erp-employee-section-body--flush"
      >
        {historyError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={errorMessage(historyError)} />
          </div>
        ) : (
          <DataTable<OvertimeSheetListItem>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table erp-leave-history-table"
            loading={historyLoading}
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
                  icon={<Clock size={28} strokeWidth={1.5} />}
                  title={t('hr.overtime.noHistory')}
                />
              ),
            }}
          />
        )}
      </OvertimeProfileSection>
    </div>
  );
}
