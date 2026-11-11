'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  ApiOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ScrollText } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { AuditLog, AuditLogSource } from '@/lib/api/types';
import { useAuditLogs, useAuditLogStats } from '@/lib/query/audit-logs';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import {
  auditLogActionVariant,
  auditLogSourceVariant,
  formatAuditLogOnBehalfSummary,
  formatAuditLogSourceLabel,
  formatAuditLogUserName,
} from '@/lib/utils/audit-log-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserDiscipline, formatUserName } from '@/lib/utils/user-display';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  blue: { bg: '#E6F1FB', fg: '#378ADD' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  green: { bg: '#EAF3DE', fg: '#639922' },
} as const;

function AuditStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat">
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

/**
 * Audit log list - Users chrome (stat bar, filter row, soft table).
 */
export default function AuditLogsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [moduleFilter, setModuleFilter] = useState('');
  const [appliedModuleFilter, setAppliedModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [appliedActionFilter, setAppliedActionFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  useSetHeaderExtra(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      const nextModule = moduleFilter.trim();
      const nextAction = actionFilter.trim();
      setAppliedModuleFilter((prev) => {
        if (prev !== nextModule) {
          setTimeout(() => resetPage(), 0);
        }
        return nextModule;
      });
      setAppliedActionFilter((prev) => {
        if (prev !== nextAction) {
          setTimeout(() => resetPage(), 0);
        }
        return nextAction;
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [moduleFilter, actionFilter, resetPage]);

  const queryParams = useMemo(
    () => ({
      ...params,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      module: appliedModuleFilter || undefined,
      action: appliedActionFilter || undefined,
      userId: userIdFilter,
      dateFrom: dateFrom?.startOf('day').toISOString(),
      dateTo: dateTo?.endOf('day').toISOString(),
    }),
    [
      params,
      appliedModuleFilter,
      appliedActionFilter,
      userIdFilter,
      dateFrom,
      dateTo,
    ],
  );

  const auditLogsQuery = useAuditLogs(queryParams);
  const statsQuery = useAuditLogStats();
  const usersDirectoryQuery = useUsersDirectory(
    { page: 1, limit: USER_DIRECTORY_PAGE_LIMIT },
    { enabled: auditLogsQuery.isSuccess },
  );

  const userOptions = useMemo(
    () =>
      (usersDirectoryQuery.data?.data ?? []).map((user) => ({
        value: user.id,
        label: `${formatUserName(user)} (${formatUserDiscipline(user)})`,
      })),
    [usersDirectoryQuery.data?.data],
  );

  const auditStats = useMemo(() => {
    const stats = statsQuery.data;
    return {
      totalCount: stats?.total ?? 0,
      userActionCount: stats?.userActions ?? 0,
      systemJobCount: stats?.systemJobs ?? 0,
      integrationCount: stats?.integrations ?? 0,
    };
  }, [statsQuery.data]);

  const hasFilters =
    Boolean(appliedModuleFilter) ||
    Boolean(appliedActionFilter) ||
    Boolean(userIdFilter) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function handleResetFilters(): void {
    setModuleFilter('');
    setAppliedModuleFilter('');
    setActionFilter('');
    setAppliedActionFilter('');
    setUserIdFilter(undefined);
    setDateFrom(null);
    setDateTo(null);
    resetPage();
  }

  async function handleRefresh(): Promise<void> {
    await Promise.all([auditLogsQuery.refetch(), statsQuery.refetch()]);
  }

  if (auditLogsQuery.isLoading && !auditLogsQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-audit-logs-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (auditLogsQuery.isError && !auditLogsQuery.data) {
    const status =
      auditLogsQuery.error instanceof ApiRequestError
        ? auditLogsQuery.error.status
        : 0;

    return (
      <div className={`erp-pro-list-page erp-users-page erp-audit-logs-page ${LIST_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={
            status === 403 || status === 401
              ? t('auditLogs.noPermission')
              : getFriendlyApiErrorMessage(
                  auditLogsQuery.error,
                  t('auditLogs.loadError'),
                  t,
                )
          }
        />
      </div>
    );
  }

  const rows = auditLogsQuery.data?.data ?? [];
  const meta = auditLogsQuery.data?.meta ?? {
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    pages: 0,
  };
  const pagination = bindMeta(meta);

  return (
    <div className={`erp-pro-list-page erp-users-page erp-audit-logs-page ${LIST_PAGE_V2}`}>
      <div className="erp-users-stat-bar">
        <AuditStat
          label={t('auditLogs.stats.total')}
          value={auditStats.totalCount}
          accent="teal"
          icon={<ScrollText size={14} />}
        />
        <AuditStat
          label={t('auditLogs.stats.userActions')}
          value={auditStats.userActionCount}
          accent="blue"
          icon={<UserOutlined />}
        />
        <AuditStat
          label={t('auditLogs.stats.systemJobs')}
          value={auditStats.systemJobCount}
          accent="amber"
          icon={<ReloadOutlined />}
        />
        <AuditStat
          label={t('auditLogs.stats.integrations')}
          value={auditStats.integrationCount}
          accent="green"
          icon={<ApiOutlined />}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('auditLogs.allEntries')}
            </h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={auditLogsQuery.isFetching && !auditLogsQuery.isLoading}
                onClick={() => void handleRefresh()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('auditLogs.filters.module')}
            className="erp-users-search-input min-w-0"
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
          />
          <Input
            allowClear
            placeholder={t('auditLogs.filters.action')}
            className="erp-users-filter-select min-w-0"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('auditLogs.filters.user')}
            className="erp-users-filter-select"
            options={userOptions}
            value={userIdFilter}
            loading={usersDirectoryQuery.isLoading}
            onChange={(value?: string) => {
              setUserIdFilter(value);
              resetPage();
            }}
          />
          <DatePicker
            placeholder={t('auditLogs.filters.dateFrom')}
            className="erp-users-filter-daterange"
            value={dateFrom}
            onChange={(value: Dayjs | null) => {
              setDateFrom(value);
              resetPage();
            }}
          />
          <DatePicker
            placeholder={t('auditLogs.filters.dateTo')}
            className="erp-users-filter-daterange"
            value={dateTo}
            onChange={(value: Dayjs | null) => {
              setDateTo(value);
              resetPage();
            }}
          />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<AuditLog>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            dataSource={rows}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
            loading={auditLogsQuery.isFetching && rows.length === 0}
            pagination={
              pagination
                ? {
                    ...pagination,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    simple: isNarrow,
                    showSizeChanger: !isNarrow,
                  }
                : undefined
            }
            onRow={(record) => ({
              onClick: () => router.push(`/audit-logs/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ScrollText />}
                  title={
                    hasFilters
                      ? t('auditLogs.emptyFilteredTitle')
                      : t('auditLogs.emptyTitle')
                  }
                  description={
                    hasFilters
                      ? t('auditLogs.emptyFilteredDescription')
                      : t('auditLogs.emptyDescription')
                  }
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : undefined
                  }
                />
              ),
            }}
            columns={[
              {
                title: t('auditLogs.columns.timestamp'),
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 170,
                render: (value: string) => (
                  <span className="erp-users-cell-sub">
                    {formatDisplayDateTime(value)}
                  </span>
                ),
              },
              {
                title: t('auditLogs.columns.user'),
                key: 'user',
                ellipsis: true,
                responsive: ['md'],
                render: (_value, record) => {
                  const onBehalf = formatAuditLogOnBehalfSummary(record, t);
                  return (
                    <div className="min-w-0">
                      <span className="erp-users-cell-strong">
                        {formatAuditLogUserName(record)}
                      </span>
                      {onBehalf ? (
                        <p className="erp-users-cell-sub m-0">{onBehalf}</p>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                title: t('auditLogs.columns.module'),
                dataIndex: 'module',
                key: 'module',
                width: 130,
                render: (value: string) => (
                  <span className="erp-users-id-chip">{value}</span>
                ),
              },
              {
                title: t('auditLogs.columns.action'),
                dataIndex: 'action',
                key: 'action',
                width: 110,
                render: (value: string) => (
                  <StatusBadge
                    label={value}
                    variant={auditLogActionVariant(value)}
                  />
                ),
              },
              {
                title: t('auditLogs.columns.recordType'),
                dataIndex: 'recordType',
                key: 'recordType',
                ellipsis: true,
                responsive: ['lg'],
                render: (value: string) => (
                  <span className="erp-users-cell-sub">{value}</span>
                ),
              },
              {
                title: t('auditLogs.columns.recordReference'),
                dataIndex: 'recordReference',
                key: 'recordReference',
                ellipsis: true,
                responsive: ['lg'],
                render: (value: string | null) => (
                  <span className="erp-users-cell-sub">{value ?? '-'}</span>
                ),
              },
              {
                title: t('auditLogs.columns.source'),
                dataIndex: 'source',
                key: 'source',
                width: 130,
                responsive: ['md'],
                render: (source: AuditLogSource) => (
                  <StatusBadge
                    label={formatAuditLogSourceLabel(source, t)}
                    variant={auditLogSourceVariant(source)}
                  />
                ),
              },
              {
                title: t('auditLogs.columns.ipAddress'),
                dataIndex: 'ipAddress',
                key: 'ipAddress',
                width: 120,
                responsive: ['xl'],
                render: (value: string | null) =>
                  value ? (
                    <span className="erp-users-cell-sub font-[family-name:var(--font-mono)] text-xs">
                      {value}
                    </span>
                  ) : (
                    <span className="erp-users-cell-sub">-</span>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
