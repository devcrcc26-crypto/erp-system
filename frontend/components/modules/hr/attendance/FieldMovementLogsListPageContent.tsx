'use client';

import { useMemo, useState } from 'react';
import { Button, InputNumber, Select, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CircleCheck,
  CircleX,
  Clock,
  Inbox,
  RefreshCw,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FieldMovementStatusBadge,
  formatFieldMovementStatus,
} from '@/components/modules/attendance/field-movement-display';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  FieldMovementLog,
  FieldMovementStatus,
} from '@/lib/api/attendance.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useFieldMovementLogsAll } from '@/lib/query/attendance';
import { useUsersDirectory } from '@/lib/query/users';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const STATUS_OPTIONS: FieldMovementStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
];

const PENDING_STATUSES: FieldMovementStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2026, index, 1).toLocaleString('en', { month: 'long' }),
}));

type StatMode = 'all' | 'pending' | 'approved' | 'rejected';

const STAT_FILTERS: Array<{
  mode: StatMode;
  label: string;
  tone: 'teal' | 'amber' | 'green' | 'red';
  icon: LucideIcon;
}> = [
  { mode: 'all', label: 'All submissions', tone: 'teal', icon: Inbox },
  { mode: 'pending', label: 'Pending approval', tone: 'amber', icon: Clock },
  { mode: 'approved', label: 'Approved', tone: 'green', icon: CircleCheck },
  { mode: 'rejected', label: 'Rejected or cancelled', tone: 'red', icon: CircleX },
];

function periodLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * HR list of field movement / early departure log submissions.
 */
export default function FieldMovementLogsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(20);

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();
  const [month, setMonth] = useState<number | undefined>(defaultMonth);
  const [year, setYear] = useState<number>(defaultYear);
  const [status, setStatus] = useState<FieldMovementStatus | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [statMode, setStatMode] = useState<StatMode>('all');

  const listQuery = useFieldMovementLogsAll(
    {
      month,
      year,
      employeeId: canViewHr ? employeeId : undefined,
    },
    true,
  );

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(
    () => ({
      all: allRows.length,
      pending: allRows.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      approved: allRows.filter((row) => row.status === 'APPROVED').length,
      rejected: allRows.filter(
        (row) => row.status === 'REJECTED' || row.status === 'CANCELLED',
      ).length,
    }),
    [allRows],
  );

  const filtered = useMemo(() => {
    let rows = allRows;
    if (status) {
      rows = rows.filter((row) => row.status === status);
    } else if (statMode === 'pending') {
      rows = rows.filter((row) => PENDING_STATUSES.includes(row.status));
    } else if (statMode === 'approved') {
      rows = rows.filter((row) => row.status === 'APPROVED');
    } else if (statMode === 'rejected') {
      rows = rows.filter(
        (row) => row.status === 'REJECTED' || row.status === 'CANCELLED',
      );
    }
    return rows;
  }, [allRows, status, statMode]);

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const employeeOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((user) => ({
        value: user.id,
        label: formatUserName(user),
      })),
    [usersQuery.data?.data],
  );

  const filtersChanged =
    month !== defaultMonth ||
    year !== defaultYear ||
    Boolean(status) ||
    Boolean(employeeId) ||
    statMode !== 'all';

  function resetFilters(): void {
    setMonth(defaultMonth);
    setYear(defaultYear);
    setStatus(undefined);
    setEmployeeId(undefined);
    setStatMode('all');
    resetPage();
  }

  const scopeLabel = month ? periodLabel(month, year) : `all of ${year}`;
  const resultsLabel = `${filtered.length} ${filtered.length === 1 ? 'log' : 'logs'} for ${scopeLabel}${
    status
      ? ` · ${formatFieldMovementStatus(status)}`
      : statMode !== 'all'
        ? ` · ${STAT_FILTERS.find((item) => item.mode === statMode)?.label}`
        : ''
  }`;

  const columns: ColumnsType<FieldMovementLog> = [
    {
      title: 'Log #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 120,
      render: (value: string, row: FieldMovementLog) => (
        <Link
          href={`/hr/field-movement-logs/${row.id}`}
          className="fm-table-link"
          onClick={(event) => event.stopPropagation()}
        >
          {value}
        </Link>
      ),
    },
    {
      title: 'Employee',
      key: 'employee',
      width: 220,
      render: (_: unknown, row: FieldMovementLog) =>
        row.employee ? (
          <span>
            {formatUserName(row.employee)}
            {row.employee.employeeId ? (
              <span className="fm-cell-sub">{row.employee.employeeId}</span>
            ) : null}
          </span>
        ) : (
          <span className="fm-muted">—</span>
        ),
    },
    {
      title: 'Period',
      key: 'period',
      width: 140,
      render: (_: unknown, row: FieldMovementLog) =>
        periodLabel(row.month, row.year),
    },
    {
      title: 'Days',
      key: 'entryCount',
      width: 80,
      align: 'right',
      render: (_: unknown, row: FieldMovementLog) => row.entryCount ?? '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (value: FieldMovementStatus) => (
        <FieldMovementStatusBadge status={value} />
      ),
    },
    {
      title: 'Waiting on',
      key: 'currentTierLabel',
      width: 160,
      render: (_: unknown, row: FieldMovementLog) =>
        PENDING_STATUSES.includes(row.status) && row.currentTierLabel ? (
          row.currentTierLabel
        ) : (
          <span className="fm-muted">—</span>
        ),
    },
    {
      title: 'Submitted',
      key: 'submittedAt',
      width: 130,
      render: (_: unknown, row: FieldMovementLog) =>
        row.submittedAt ? (
          new Date(row.submittedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        ) : (
          <span className="fm-muted">Not submitted</span>
        ),
    },
  ];

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="error" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="fm-page erp-pro-list-page erp-users-page flex flex-col gap-4">
      <header className="fm-page-header">
        <div>
          <h1 className="fm-h1">Field movement logs</h1>
          <p className="fm-lead">
            Employee explanations for flagged attendance days, such as field
            visits, early departures and missed clock-ins.
          </p>
        </div>
        <Button
          icon={<RefreshCw size={16} aria-hidden />}
          loading={listQuery.isFetching && !listQuery.isLoading}
          onClick={() => void listQuery.refetch()}
        >
          Refresh
        </Button>
      </header>

      <div
        className="fm-stat-filters"
        role="group"
        aria-label="Show submissions by status"
      >
        {STAT_FILTERS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.mode}
              type="button"
              className="fm-stat-filter"
              aria-pressed={statMode === item.mode && !status}
              onClick={() => {
                setStatMode(item.mode);
                setStatus(undefined);
                resetPage();
              }}
            >
              <span
                className={`fm-stat-filter__icon fm-stat-filter__icon--${item.tone}`}
                aria-hidden
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="fm-stat-filter__label">{item.label}</span>
                <span className="fm-stat-filter__value">
                  {statusCounts[item.mode].toLocaleString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="fm-card" aria-labelledby="fm-filters-title">
        <div className="fm-card__body">
          <h2 id="fm-filters-title" className="fm-sr-only">
            Filters
          </h2>
          <div className="fm-filters">
            <div className="fm-field">
              <label htmlFor="fm-filter-month" className="fm-field__label">
                Month
              </label>
              <Select
                id="fm-filter-month"
                allowClear
                placeholder="All months"
                value={month}
                options={MONTH_OPTIONS}
                onChange={(value) => {
                  setMonth(value);
                  resetPage();
                }}
              />
            </div>
            <div className="fm-field">
              <label htmlFor="fm-filter-year" className="fm-field__label">
                Year
              </label>
              <InputNumber
                id="fm-filter-year"
                style={{ width: '100%' }}
                min={2020}
                max={now.getFullYear() + 1}
                value={year}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    setYear(value);
                    resetPage();
                  }
                }}
              />
            </div>
            <div className="fm-field">
              <label htmlFor="fm-filter-status" className="fm-field__label">
                Status
              </label>
              <Select
                id="fm-filter-status"
                allowClear
                placeholder="Any status"
                value={status}
                options={STATUS_OPTIONS.map((item) => ({
                  value: item,
                  label: formatFieldMovementStatus(item),
                }))}
                onChange={(value) => {
                  setStatus(value);
                  setStatMode('all');
                  resetPage();
                }}
              />
            </div>
            <div className="fm-field">
              <label htmlFor="fm-filter-employee" className="fm-field__label">
                Employee
              </label>
              <Select
                id="fm-filter-employee"
                allowClear
                showSearch
                placeholder="Everyone"
                optionFilterProp="label"
                value={employeeId}
                options={employeeOptions}
                loading={usersQuery.isLoading}
                onChange={(value) => {
                  setEmployeeId(value);
                  resetPage();
                }}
              />
            </div>
            <Button
              icon={<RotateCcw size={16} aria-hidden />}
              disabled={!filtersChanged}
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          </div>
        </div>
      </section>

      <p className="fm-results-line" aria-live="polite">
        {listQuery.isLoading ? 'Loading logs…' : `Showing ${resultsLabel}`}
      </p>

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            'Failed to load field movement logs',
            t,
          )}
        />
      ) : listQuery.isLoading && rows.length === 0 ? (
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      ) : (
        <DataTable<FieldMovementLog>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Inbox size={20} aria-hidden />}
                title="No field movement logs"
                description={
                  filtersChanged
                    ? 'Nothing matches these filters. Try another month or reset the filters.'
                    : 'No one has submitted an explanation for this month yet.'
                }
              />
            ),
          }}
          onRow={(row) => ({
            onClick: () => router.push(`/hr/field-movement-logs/${row.id}`),
            className: 'cursor-pointer',
          })}
        />
      )}
    </div>
  );
}
