'use client';

import './field-movement-logs-v2.css';
import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  InputNumber,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FieldMovementStatusBadge,
  formatFieldMovementStatus,
} from '@/components/modules/attendance/field-movement-display';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  FieldMovementLog,
  FieldMovementStatus,
} from '@/lib/api/attendance.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useFieldMovementLogsAll } from '@/lib/query/attendance';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import { useCurrentUser } from '@/lib/query/profile';
import { fieldMovementCreateActions } from '@/lib/utils/field-movement-actions';
import { useUsersDirectory } from '@/lib/query/users';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';

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

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
] as const;

type StatMode = 'all' | 'pending' | 'approved' | 'rejected';

function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * HR list of field movement / early departure log submissions.
 */
export default function FieldMovementLogsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  // Supervisors see their team's logs (backend-scoped).
  const canViewTeam = useCanViewTeam();
  const { params, resetPage, bindMeta } = useTablePagination(20);
  const currentUser = useCurrentUser();
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
  );
  const { canAddSelf, canAddOnBehalf } = fieldMovementCreateActions({
    employeeId: currentUser.data?.employeeId,
    excludedFromHrProcesses: currentUser.data?.excludedFromHrProcesses,
    eligibleEmployeeCount: eligibleQuery.data?.length ?? 0,
  });

  const now = useMemo(() => new Date(), []);
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

  const fetchedRows = listQuery.data ?? [];
  // HR filters on the server; supervisors filter their team list here so the
  // employee options stay complete.
  const allRows =
    canViewHr || !employeeId
      ? fetchedRows
      : fetchedRows.filter((row) => row.employee?.id === employeeId);

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

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: t(`hr.months.${i + 1}`),
      })),
    [t],
  );

  const employeeOptions = useMemo(
    () =>
      canViewHr
        ? (usersQuery.data?.data ?? []).map((user) => ({
            value: user.id,
            label: formatUserName(user),
          }))
        : teamEmployeeOptions(fetchedRows),
    [canViewHr, usersQuery.data?.data, fetchedRows],
  );

  const monthName =
    month != null ? t(`hr.months.${month}`) : t('pages.hr.fieldMovementLogs.filters.allMonths');
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

  const columns: ColumnsType<FieldMovementLog> = useMemo(
    () => [
      {
        title: t('pages.hr.fieldMovementLogs.columns.logNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        render: (value: string, row: FieldMovementLog) => (
          <Link
            href={`/hr/field-movement-logs/${row.id}`}
            className="erp-fml-log-link"
            onClick={(event) => event.stopPropagation()}
          >
            {value}
          </Link>
        ),
      },
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 260,
        render: (_: unknown, row: FieldMovementLog) => {
          if (!row.employee) {
            return <span className="erp-fml-dash">-</span>;
          }
          const name = formatUserName(row.employee);
          const erpId = row.employee.employeeId?.trim() || '-';
          return (
            <div className="erp-fml-person">
              <Avatar
                size={36}
                className="erp-users-avatar"
                style={{ background: avatarColor(row.employee.id) }}
              >
                {initialsOf(row.employee.firstName, row.employee.lastName)}
              </Avatar>
              <div className="min-w-0">
                <div className="erp-users-name truncate">{name}</div>
                <span className="erp-users-id-chip mt-0.5 inline-block">{erpId}</span>
              </div>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.fieldMovementLogs.columns.period'),
        key: 'period',
        width: 140,
        render: (_: unknown, row: FieldMovementLog) =>
          `${t(`hr.months.${row.month}`)} ${row.year}`,
      },
      {
        title: t('pages.hr.fieldMovementLogs.columns.days'),
        key: 'entryCount',
        width: 80,
        align: 'right',
        render: (_: unknown, row: FieldMovementLog) => (
          <span className="erp-fml-num">{row.entryCount ?? '-'}</span>
        ),
      },
      {
        title: t('pages.hr.fieldMovementLogs.columns.status'),
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: FieldMovementStatus) => (
          <FieldMovementStatusBadge status={value} />
        ),
      },
      {
        title: t('pages.hr.fieldMovementLogs.columns.waitingOn'),
        key: 'currentTierLabel',
        width: 160,
        render: (_: unknown, row: FieldMovementLog) =>
          PENDING_STATUSES.includes(row.status) && row.currentTierLabel ? (
            row.currentTierLabel
          ) : (
            <span className="erp-fml-dash">-</span>
          ),
      },
      {
        title: t('pages.hr.fieldMovementLogs.columns.submitted'),
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
            <span className="erp-fml-dash">
              {t('pages.hr.fieldMovementLogs.columns.notSubmitted')}
            </span>
          ),
      },
    ],
    [t],
  );

  if (!canViewTeam) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
        <Alert
          type="error"
          showIcon
          title={t('pages.hr.accessDenied')}
        />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
        <div className="erp-pro-card flex justify-center p-12">
          <Spin />
        </div>
      </div>
    );
  }

  const emptyState = (
    <div className="erp-fml-empty">
      <span className="erp-fml-empty-icon" aria-hidden>
        <InboxOutlined />
      </span>
      <p className="erp-fml-empty-title">
        {filtersChanged
          ? t('pages.hr.fieldMovementLogs.emptyFiltered')
          : t('pages.hr.fieldMovementLogs.emptyTitle', {
              month: monthName,
              year: String(year),
            })}
      </p>
      {!filtersChanged ? (
        <p className="erp-fml-empty-text">
          {t('pages.hr.fieldMovementLogs.emptyDescription')}
        </p>
      ) : null}
      {filtersChanged ? (
        <Button type="link" onClick={resetFilters}>
          {t('common.reset')}
        </Button>
      ) : null}
    </div>
  );

  const stats: Array<{
    mode: StatMode;
    label: string;
    hint: string;
    value: number;
    chipBg: string;
    chipFg: string;
    icon: React.ReactNode;
  }> = [
    {
      mode: 'all',
      label: t('pages.hr.fieldMovementLogs.stats.all'),
      hint: t('pages.hr.fieldMovementLogs.stats.allHint'),
      value: statusCounts.all,
      chipBg: 'var(--color-blue-50)',
      chipFg: 'var(--color-blue-400)',
      icon: <InboxOutlined />,
    },
    {
      mode: 'pending',
      label: t('pages.hr.fieldMovementLogs.stats.pending'),
      hint: t('pages.hr.fieldMovementLogs.stats.pendingHint'),
      value: statusCounts.pending,
      chipBg: 'var(--color-amber-50)',
      chipFg: 'var(--color-amber-400)',
      icon: <ClockCircleOutlined />,
    },
    {
      mode: 'approved',
      label: t('pages.hr.fieldMovementLogs.stats.approved'),
      hint: t('pages.hr.fieldMovementLogs.stats.approvedHint'),
      value: statusCounts.approved,
      chipBg: 'var(--color-teal-50)',
      chipFg: 'var(--color-teal-400)',
      icon: <CheckCircleOutlined />,
    },
    {
      mode: 'rejected',
      label: t('pages.hr.fieldMovementLogs.stats.rejected'),
      hint: t('pages.hr.fieldMovementLogs.stats.rejectedHint'),
      value: statusCounts.rejected,
      chipBg: 'color-mix(in srgb, var(--color-red-400) 12%, var(--color-surface-secondary))',
      chipFg: 'var(--color-red-400)',
      icon: <CloseCircleOutlined />,
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('pages.hr.fieldMovementLogs.loadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        {stats.map((stat) => {
          const active = statMode === stat.mode && !status;
          return (
            <button
              key={stat.mode}
              type="button"
              className={`erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}`}
              onClick={() => {
                setStatMode(stat.mode);
                setStatus(undefined);
                resetPage();
              }}
              aria-pressed={active}
            >
              <span
                className="erp-users-stat-chip"
                style={{ background: stat.chipBg, color: stat.chipFg }}
              >
                {stat.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p className="erp-users-stat-label">{stat.label}</p>
                <p className="erp-users-stat-value">
                  {stat.value.toLocaleString()}
                </p>
                <p className="erp-fml-stat-hint">{stat.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="erp-pro-card-toolbar-title">
                {t('pages.hr.fieldMovementLogs.listTitle')}
              </h3>
              <span className="erp-users-count-pill">
                {filtered.length.toLocaleString()}
              </span>
            </div>
            <p className="erp-fml-toolbar-sub">
              {monthName} {year}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            {canAddOnBehalf ? (
              <Button
                icon={<UserAddOutlined />}
                onClick={() =>
                  router.push('/approvals/new/field-movement-log?onBehalf=1')
                }
              >
                {t('pages.hr.fieldMovementLogs.addOnBehalf')}
              </Button>
            ) : null}
            {canAddSelf ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/field-movement-log')}
              >
                {t('pages.hr.fieldMovementLogs.add')}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="erp-users-filter-bar">
          <Select
            allowClear
            value={month}
            options={monthOptions}
            onChange={(value) => {
              setMonth(value);
              resetPage();
            }}
            className="erp-users-filter-select"
            placeholder={t('pages.hr.fieldMovementLogs.filters.allMonths')}
            aria-label={t('pages.hr.fieldMovementLogs.filters.month')}
          />
          <InputNumber
            value={year}
            min={2020}
            max={now.getFullYear() + 1}
            onChange={(value) => {
              if (typeof value === 'number') {
                setYear(value);
                resetPage();
              }
            }}
            className="erp-fml-filter-year"
            aria-label={t('pages.hr.fieldMovementLogs.filters.year')}
          />
          <Select
            allowClear
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
            className="erp-users-filter-select"
            placeholder={t('pages.hr.fieldMovementLogs.filters.anyStatus')}
            aria-label={t('pages.hr.fieldMovementLogs.filters.status')}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={employeeId}
            options={employeeOptions}
            loading={usersQuery.isLoading}
            onChange={(value) => {
              setEmployeeId(value);
              resetPage();
            }}
            className="erp-fml-filter-employee"
            placeholder={t('pages.hr.fieldMovementLogs.filters.everyone')}
            aria-label={t('pages.hr.fieldMovementLogs.filters.employee')}
          />
          {filtersChanged ? (
            <Button type="link" onClick={resetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<FieldMovementLog>
            className="erp-data-table erp-pro-table"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching}
            scroll={{ x: 1100 }}
            pagination={bindMeta(meta)}
            locale={{ emptyText: emptyState }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/field-movement-logs/${row.id}`),
              className: 'cursor-pointer',
            })}
          />
        </div>
      </div>
    </div>
  );
}
