'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Select, Skeleton, Spin } from 'antd';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import {
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveBalance,
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  useLeaveBalances,
  useLeaveRequestsAll,
  useMyLeaveBalances,
  useMyLeaveRequestsAll,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { useUser } from '@/lib/query/users';
import {
  OWN_BALANCE_LEAVE_TYPES,
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { leaveRequestDetailHref } from '@/lib/utils/hr-self-service-nav';
import {
  leaveHistoryPath,
  myLeaveHistoryPath,
} from '@/lib/utils/leave-history-path';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const HISTORY_PAGE_SIZE = 15;
const LOW_BALANCE_THRESHOLD = 5;

export type LeaveHistoryPageMode = 'self' | 'employee';

interface LeaveHistoryPageContentProps {
  mode: LeaveHistoryPageMode;
  /** Required when mode is `employee`. */
  employeeId?: string;
}

function pickBalance(
  balances: LeaveBalance[],
  leaveType: LeaveType,
): LeaveBalance | null {
  return balances.find((row) => row.leaveType === leaveType) ?? null;
}

function BalanceTile({
  label,
  balance,
}: {
  label: string;
  balance: LeaveBalance | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!balance) {
    return (
      <div
        className="rounded-md p-3"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorPageBg,
        }}
      >
        <p
          className="m-0 text-xs font-medium uppercase tracking-wide"
          style={{ color: tokens.colorTextTertiary }}
        >
          {label}
        </p>
        <p
          className="m-0 mt-2 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          -
        </p>
      </div>
    );
  }

  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;
  const pool = balance.entitled + balance.broughtForward;

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
      <p className="m-0 mt-2">
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: isLow ? '#BA7517' : tokens.colorTextPrimary }}
        >
          {balance.remaining}
        </span>
        <span
          className="ml-1 text-sm"
          style={{ color: tokens.colorTextTertiary }}
        >
          / {pool}
        </span>
      </p>
      <p
        className="m-0 mt-1 text-xs"
        style={{ color: tokens.colorTextSecondary }}
      >
        {t('hr.leave.usedPending', {
          used: balance.used,
          pending: balance.pending,
        })}
      </p>
    </div>
  );
}

/**
 * Independent leave balance + leave history page for one employee (or self).
 */
export default function LeaveHistoryPageContent({
  mode,
  employeeId,
}: LeaveHistoryPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const currentUserQuery = useCurrentUser();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [historyPage, setHistoryPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    LeaveRequestStatus | undefined
  >();
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<LeaveType | undefined>();

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
      return myLeaveHistoryPath();
    }
    if (targetEmployeeId) {
      return leaveHistoryPath(targetEmployeeId);
    }
    return myLeaveHistoryPath();
  }, [isSelf, targetEmployeeId]);

  const employeeQuery = useUser(
    targetEmployeeId ?? '',
    !isSelf && employeeEnabled && allowed,
  );

  const myBalancesQuery = useMyLeaveBalances(year, isSelf && allowed);
  const employeeBalancesQuery = useLeaveBalances(
    {
      page: 1,
      limit: 1,
      year,
      employeeId: targetEmployeeId,
    },
    !isSelf && employeeEnabled && canViewHr && allowed,
  );
  const ownBalancesAsEmployeeQuery = useMyLeaveBalances(
    year,
    Boolean(isOwnEmployeePage && !canViewHr && allowed),
  );

  const myHistoryQuery = useMyLeaveRequestsAll({}, isSelf && allowed);
  const employeeHistoryQuery = useLeaveRequestsAll(
    { employeeId: targetEmployeeId },
    !isSelf && employeeEnabled && canViewHr && allowed,
  );
  const ownHistoryAsEmployeeQuery = useMyLeaveRequestsAll(
    {},
    Boolean(isOwnEmployeePage && !canViewHr && allowed),
  );

  const balancesQuery = isSelf
    ? myBalancesQuery
    : canViewHr
      ? employeeBalancesQuery
      : ownBalancesAsEmployeeQuery;
  const historyQuery = isSelf
    ? myHistoryQuery
    : canViewHr
      ? employeeHistoryQuery
      : ownHistoryAsEmployeeQuery;

  const displayName = useMemo(() => {
    if (isSelf) {
      const me = currentUserQuery.data;
      return me ? formatUserName(me) : t('pages.hr.leaveHistory.you');
    }
    if (employeeQuery.data) {
      return formatUserName(employeeQuery.data);
    }
    const summary = employeeBalancesQuery.data?.data?.[0]?.employee;
    if (summary) {
      return formatLeaveEmployeeName(summary);
    }
    return t('hr.placeholder.employee');
  }, [
    isSelf,
    currentUserQuery.data,
    employeeQuery.data,
    employeeBalancesQuery.data?.data,
    t,
  ]);

  const balancesLoading = balancesQuery.isLoading;
  const balancesError = balancesQuery.error;

  const displayBalances = useMemo((): Array<{
    leaveType: LeaveType;
    balance: LeaveBalance | null;
  }> => {
    if (canViewHr && !isSelf) {
      const summary = employeeBalancesQuery.data?.data?.[0];
      return [
        { leaveType: 'ANNUAL' as const, balance: summary?.annual ?? null },
        {
          leaveType: 'MATERNITY' as const,
          balance: summary?.maternity ?? null,
        },
        { leaveType: 'SICK' as const, balance: summary?.sick ?? null },
      ];
    }

    const rows: LeaveBalance[] = Array.isArray(balancesQuery.data)
      ? balancesQuery.data
      : [];
    return OWN_BALANCE_LEAVE_TYPES.map((leaveType) => ({
      leaveType,
      balance: pickBalance(rows, leaveType),
    }));
  }, [
    canViewHr,
    isSelf,
    employeeBalancesQuery.data?.data,
    balancesQuery.data,
  ]);

  const allHistory = useMemo(() => {
    const rows = historyQuery.data ?? [];
    return [...rows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [historyQuery.data]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter((row) => {
      if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      if (leaveTypeFilter && row.leaveType !== leaveTypeFilter) {
        return false;
      }
      return true;
    });
  }, [allHistory, statusFilter, leaveTypeFilter]);

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

  const leaveTypeOptions = useMemo(
    () =>
      (
        [
          'ANNUAL',
          'SICK',
          'UNPAID',
          'MATERNITY',
          'PATERNITY',
          'EMERGENCY',
          'COMPASSIONATE',
          'STUDY',
          'EXAM',
        ] as LeaveType[]
      ).map((value) => ({
        value,
        label: formatLeaveType(value, t),
      })),
    [t],
  );

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
        ] as LeaveRequestStatus[]
      ).map((value) => ({
        value,
        label: formatLeaveStatus(value, t),
      })),
    [t],
  );

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 140,
        render: (value: string) => (
          <span className="font-medium tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.leaveType'),
        dataIndex: 'leaveType',
        key: 'leaveType',
        width: 130,
        render: (value: LeaveType) => (
          <StatusBadge
            label={formatLeaveType(value, t)}
            variant={leaveTypeVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 72,
        align: 'right',
      },
      {
        title: t('common.status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: string) => (
          <StatusBadge
            label={formatLeaveStatus(value, t)}
            variant={leaveStatusVariant(value)}
          />
        ),
      },
    ],
    [t],
  );

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('hr.leave.profileLoadError');
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
    router.push('/hr/leave-requests');
  }

  if (!isSelf && !employeeId) {
    return (
      <Alert type="error" showIcon title={t('hr.leave.profileLoadError')} />
    );
  }

  if (!allowed) {
    return (
      <div className={`erp-pro-list-page flex flex-col ${LIST_PAGE_V2}`}>
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
      <div className={`erp-pro-list-page flex flex-col ${LIST_PAGE_V2}`}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const annual = displayBalances.find((b) => b.leaveType === 'ANNUAL')?.balance;
  const sick = displayBalances.find((b) => b.leaveType === 'SICK')?.balance;

  return (
    <div className={`erp-pro-list-page flex flex-col ${LIST_PAGE_V2}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={handleBack}
            className="!mb-2 !px-0"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('hr.buttons.back')}
          </Button>
        </div>
      </div>

      <SummaryStrip
        items={[
          {
            label: t('hr.table.employee'),
            value: displayName,
          },
          {
            label: t('hr.table.year'),
            value: String(year),
          },
          {
            label: t('hr.leaveType.ANNUAL'),
            value:
              annual != null
                ? `${annual.remaining} / ${annual.entitled + annual.broughtForward}`
                : '-',
          },
          {
            label: t('hr.leaveType.SICK'),
            value:
              sick != null
                ? `${sick.remaining} / ${sick.entitled + sick.broughtForward}`
                : '-',
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.leaveBalance')}
        bodyClassName="p-4"
        action={
          <div className="flex items-center gap-2">
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
        }
      >
        {balancesError ? (
          <Alert
            type="error"
            showIcon
            title={errorMessage(balancesError)}
          />
        ) : balancesLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {displayBalances.map(({ leaveType, balance }) => (
              <BalanceTile
                key={leaveType}
                label={formatLeaveType(leaveType, t)}
                balance={balance}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('hr.leave.historyTitle')} bodyClassName="p-0">
        <div
          className="erp-filter-bar border-b px-3 py-3 sm:px-4"
          style={{ borderColor: tokens.colorBorder }}
        >
          <Select
            allowClear
            placeholder={t('hr.placeholder.leaveType')}
            className="w-full min-w-0 sm:w-44"
            options={leaveTypeOptions}
            value={leaveTypeFilter}
            onChange={(value) => {
              setLeaveTypeFilter(value);
              setHistoryPage(1);
            }}
          />
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
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            size="small"
            loading={historyQuery.isLoading}
            columns={columns}
            dataSource={historyRows}
            onRow={(record) => ({
              onClick: () =>
                router.push(
                  leaveRequestDetailHref(record.id, detailReturnTo),
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
                  icon={<CalendarDays />}
                  title={t('hr.leave.noHistory')}
                />
              ),
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
