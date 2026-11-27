'use client';
import { accent } from '@/lib/theme/accent';

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
import type { PayrollOtCategory, PayrollOtProfileManualLine } from '@/lib/api/payroll.types';
import type { OvertimeSheetListItem } from '@/lib/api/overtime.types';
import { useEmployeeOtManual } from '@/lib/query/payroll';
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
import { formatUserName } from '@/lib/utils/user-display';

const HISTORY_PAGE_SIZE = 10;

const MANUAL_CATEGORY_LABEL: Record<PayrollOtCategory, string> = {
  NORMAL: 'hr.overtimeCategory.regular',
  EVENING: 'hr.overtimeCategory.night',
  SUNDAY: 'hr.overtimeCategory.weekend',
  HOLIDAY: 'hr.overtimeCategory.holiday',
};

const MANUAL_TO_SHEET: Record<
  PayrollOtCategory,
  'regular' | 'night' | 'weekend' | 'holiday'
> = {
  NORMAL: 'regular',
  EVENING: 'night',
  SUNDAY: 'weekend',
  HOLIDAY: 'holiday',
};

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
  sheetHours: number;
  manualHours: number;
};

type ProfileOtHistoryRow =
  | {
      key: string;
      kind: 'sheet';
      month: number;
      year: number;
      sortAt: number;
      sheet: OvertimeSheetListItem;
    }
  | {
      key: string;
      kind: 'manual';
      month: number;
      year: number;
      sortAt: number;
      line: PayrollOtProfileManualLine;
    };

function emptyTotals(): YearTotals {
  return {
    regular: 0,
    night: 0,
    weekend: 0,
    holiday: 0,
    total: 0,
    sheets: 0,
    sheetHours: 0,
    manualHours: 0,
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
    totals.sheetHours += sheet.totalHours;
    totals.sheets += 1;
  }
  return totals;
}

function addManualTotals(
  totals: YearTotals,
  lines: PayrollOtProfileManualLine[],
): YearTotals {
  const next = { ...totals };
  for (const line of lines) {
    const bucket = MANUAL_TO_SHEET[line.otCategory];
    next[bucket] += line.hours;
    next.manualHours += line.hours;
    next.total += line.hours;
  }
  return next;
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
 * HR employee detail. Both modes list only that employee's sheets, plus any
 * manual paper OT saved on live payroll runs.
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
  const manualQuery = useEmployeeOtManual(
    targetEmployeeId ?? '',
    employeeEnabled,
  );

  const historyLoading =
    sheetsQuery.isLoading || manualQuery.isLoading || periodsLoading;
  const historyError = sheetsQuery.error ?? manualQuery.error;

  const filteredSheets = useMemo(() => {
    const rows = sheetsQuery.data ?? [];
    return selectedPeriod != null
      ? rows.filter((sheet) =>
          monthOverlapsContractPeriod(sheet.year, sheet.month, selectedPeriod),
        )
      : rows;
  }, [sheetsQuery.data, selectedPeriod]);

  const filteredManual = useMemo(() => {
    const rows = manualQuery.data ?? [];
    return selectedPeriod != null
      ? rows.filter((line) =>
          monthOverlapsContractPeriod(line.year, line.month, selectedPeriod),
        )
      : rows;
  }, [manualQuery.data, selectedPeriod]);

  const allHistory = useMemo((): ProfileOtHistoryRow[] => {
    const sheetRows: ProfileOtHistoryRow[] = filteredSheets.map((sheet) => ({
      key: `sheet-${sheet.id}`,
      kind: 'sheet',
      month: sheet.month,
      year: sheet.year,
      sortAt: new Date(sheet.createdAt).getTime(),
      sheet,
    }));
    const manualRows: ProfileOtHistoryRow[] = filteredManual.map((line) => ({
      key: `manual-${line.id}`,
      kind: 'manual',
      month: line.month,
      year: line.year,
      sortAt: new Date(line.recordedAt).getTime(),
      line,
    }));
    return [...sheetRows, ...manualRows].sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      if (a.month !== b.month) {
        return b.month - a.month;
      }
      if (a.kind !== b.kind) {
        // Sheets first within the month, then paper lines.
        return a.kind === 'sheet' ? -1 : 1;
      }
      return b.sortAt - a.sortAt;
    });
  }, [filteredSheets, filteredManual]);

  const yearTotals = useMemo(
    () => addManualTotals(sumSheetTotals(filteredSheets), filteredManual),
    [filteredSheets, filteredManual],
  );

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

  const columns: ColumnsType<ProfileOtHistoryRow> = useMemo(() => {
    const sourceColumn: ColumnsType<ProfileOtHistoryRow>[number] = {
      title: t('hr.overtime.profileSource'),
      key: 'source',
      width: 200,
      render: (_: unknown, row: ProfileOtHistoryRow) =>
        row.kind === 'sheet' ? (
          <span className="erp-users-id-chip">{row.sheet.sheetNumber}</span>
        ) : (
          <span className="erp-users-cell-sub">{t('hr.overtime.manualPaperSource')}</span>
        ),
    };
    const periodColumn: ColumnsType<ProfileOtHistoryRow>[number] = {
      title: t('hr.table.period'),
      key: 'period',
      width: 140,
      render: (_: unknown, row: ProfileOtHistoryRow) => (
        <span className="erp-users-cell-strong">
          {formatOvertimePeriod(row.month, row.year, t)}
        </span>
      ),
    };
    const categoryColumn: ColumnsType<ProfileOtHistoryRow>[number] = {
      title: t('hr.overtime.profileCategory'),
      key: 'category',
      width: 120,
      render: (_: unknown, row: ProfileOtHistoryRow) =>
        row.kind === 'manual' ? (
          <span className="erp-users-cell-sub">
            {t(MANUAL_CATEGORY_LABEL[row.line.otCategory])}
          </span>
        ) : (
          <span className="erp-users-cell-sub">—</span>
        ),
    };
    const statusColumn: ColumnsType<ProfileOtHistoryRow>[number] = {
      title: t('common.status'),
      key: 'status',
      width: 220,
      render: (_: unknown, row: ProfileOtHistoryRow) => {
        if (row.kind === 'sheet') {
          return (
            <StatusBadge
              label={formatOvertimeStatus(row.sheet.status, t)}
              variant={overtimeStatusVariant(row.sheet.status)}
            />
          );
        }
        if (row.line.includedInPayroll) {
          return (
            <StatusBadge
              label={t('hr.overtime.manualIncluded', {
                runNumber: row.line.runNumber,
              })}
              variant="success"
            />
          );
        }
        return (
          <StatusBadge
            label={t('hr.overtime.manualPending')}
            variant="warning"
          />
        );
      },
    };

    if (showCategoryColumns) {
      const hoursColumn = (
        dataIndex: 'regular' | 'night' | 'weekend' | 'holiday' | 'total',
        title: string,
        strong = false,
      ): ColumnsType<ProfileOtHistoryRow>[number] => ({
        title,
        key: dataIndex,
        width: strong ? 104 : 88,
        align: 'right',
        responsive: strong ? undefined : ['md'],
        render: (_: unknown, row: ProfileOtHistoryRow) => {
          let value = 0;
          if (row.kind === 'sheet') {
            const sheet = row.sheet;
            value =
              dataIndex === 'regular'
                ? sheet.totalRegularHours
                : dataIndex === 'night'
                  ? sheet.totalNightHours
                  : dataIndex === 'weekend'
                    ? sheet.totalWeekendHours
                    : dataIndex === 'holiday'
                      ? sheet.totalHolidayHours
                      : sheet.totalHours;
          } else {
            const bucket = MANUAL_TO_SHEET[row.line.otCategory];
            value =
              dataIndex === 'total' || dataIndex === bucket ? row.line.hours : 0;
          }
          return (
            <span
              className={`${strong ? 'erp-users-cell-strong' : 'erp-users-cell-sub'} tabular-nums`}
            >
              {formatOvertimeHours(value)}
            </span>
          );
        },
      });
      return [
        sourceColumn,
        periodColumn,
        categoryColumn,
        hoursColumn('regular', t('hr.overtimeCategory.regular')),
        hoursColumn('night', t('hr.overtimeCategory.night')),
        hoursColumn('weekend', t('hr.overtimeCategory.weekend')),
        hoursColumn('holiday', t('hr.overtimeCategory.holiday')),
        hoursColumn('total', t('hr.table.totalHours'), true),
        statusColumn,
      ];
    }

    return [
      sourceColumn,
      periodColumn,
      categoryColumn,
      {
        title: t('hr.table.totalHours'),
        key: 'totalHours',
        width: 96,
        align: 'right',
        render: (_: unknown, row: ProfileOtHistoryRow) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatOvertimeHours(
              row.kind === 'sheet' ? row.sheet.totalHours : row.line.hours,
            )}
          </span>
        ),
      },
      statusColumn,
      {
        title: t('hr.table.submittedDate'),
        key: 'submittedAt',
        width: 140,
        responsive: ['md'],
        render: (_: unknown, row: ProfileOtHistoryRow) => {
          if (row.kind === 'sheet') {
            return (
              <span className="erp-users-cell-sub">
                {row.sheet.submittedAt
                  ? formatProjectDate(row.sheet.submittedAt)
                  : '-'}
              </span>
            );
          }
          return (
            <span className="erp-users-cell-sub">
              {formatUserName(row.line.recordedBy)} ·{' '}
              {formatProjectDate(row.line.recordedAt)}
            </span>
          );
        },
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
              accent={accent.primary}
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
              accent={accent.hover}
              meta={t('hr.overtime.periodHoursSplit', {
                sheet: formatOvertimeHours(yearTotals.sheetHours),
                manual: formatOvertimeHours(yearTotals.manualHours),
                combined: formatOvertimeHours(yearTotals.total),
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
          <DataTable<ProfileOtHistoryRow>
            rowKey="key"
            size="small"
            className="erp-pro-table erp-users-table erp-leave-history-table"
            loading={historyLoading}
            columns={columns}
            dataSource={historyRows}
            onRow={(record) =>
              record.kind === 'sheet'
                ? {
                    onClick: () =>
                      router.push(
                        overtimeSheetDetailHref(record.sheet.id, detailReturnTo),
                      ),
                    style: { cursor: 'pointer' },
                  }
                : {}
            }
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
