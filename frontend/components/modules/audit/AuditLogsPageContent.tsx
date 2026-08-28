'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  DatePicker,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  ApiOutlined,
  EyeOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ScrollText } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { AuditLog, AuditLogSource } from '@/lib/api/types';
import { useAuditLogs, useAuditLogStats } from '@/lib/query/audit-logs';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import {
  auditLogActionVariant,
  auditLogSourceVariant,
  formatAuditLogSourceLabel,
  formatAuditLogUserName,
} from '@/lib/utils/audit-log-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatUserDiscipline, formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

export default function AuditLogsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [moduleFilter, setModuleFilter] = useState('');
  const [appliedModuleFilter, setAppliedModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [appliedActionFilter, setAppliedActionFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

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
      <div className="flex flex-col gap-4">
        <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
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

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={ScrollText}
          title={t('auditLogs.title')}
          description={t('auditLogs.noPermission')}
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ScrollText}
        title={t('auditLogs.title')}
        description={t('auditLogs.loadError')}
      />
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
    <div className="flex flex-col gap-4">
        <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label={t('auditLogs.stats.total')}
            value={auditStats.totalCount}
            color="teal"
            icon={<ScrollText size={14} />}
          />
          <StatCard
            label={t('auditLogs.stats.userActions')}
            value={auditStats.userActionCount}
            color="blue"
            icon={<UserOutlined />}
          />
          <StatCard
            label={t('auditLogs.stats.systemJobs')}
            value={auditStats.systemJobCount}
            color="amber"
            icon={<ReloadOutlined />}
          />
          <StatCard
            label={t('auditLogs.stats.integrations')}
            value={auditStats.integrationCount}
            color="green"
            icon={<ApiOutlined />}
          />
        </div>

        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
          <div className="erp-filter-bar">
            <Input
              allowClear
              placeholder={t('auditLogs.filters.module')}
              className="w-full min-w-0 sm:w-40"
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
            />
            <Input
              allowClear
              placeholder={t('auditLogs.filters.action')}
              className="w-full min-w-0 sm:w-36"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('auditLogs.filters.user')}
              className="w-full min-w-0 sm:w-52"
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
              className="w-full min-w-0 sm:w-40"
              value={dateFrom}
              onChange={(value: Dayjs | null) => {
                setDateFrom(value);
                resetPage();
              }}
            />
            <DatePicker
              placeholder={t('auditLogs.filters.dateTo')}
              className="w-full min-w-0 sm:w-40"
              value={dateTo}
              onChange={(value: Dayjs | null) => {
                setDateTo(value);
                resetPage();
              }}
            />
            <Button onClick={handleResetFilters} style={{ borderRadius: 0 }}>
              {t('common.reset')}
            </Button>
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={auditLogsQuery.isFetching && !auditLogsQuery.isLoading}
                onClick={() => void handleRefresh()}
                aria-label={t('common.refresh')}
                style={{ borderRadius: 0 }}
              />
            </Tooltip>
          </div>
        </div>

        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ScrollText size={16} style={{ color: tokens.colorPrimary }} />
              <h3
                className="m-0 text-sm font-semibold"
                style={{ color: tokens.colorTextPrimary }}
              >
                {t('auditLogs.allEntries')}
              </h3>
              <span
                className="text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {meta.total === 1
                  ? t('auditLogs.entryCountOne')
                  : t('auditLogs.entryCount', { count: meta.total })}
              </span>
            </div>
          </div>

          <div className="px-0">
            <DataTable<AuditLog>
              rowKey="id"
              className="erp-pro-table"
              size="small"
              dataSource={rows}
              scroll={false}
              loading={auditLogsQuery.isLoading}
              pagination={
                pagination
                  ? {
                      ...pagination,
                      pageSizeOptions: ['10', '20', '50', '100'],
                    }
                  : undefined
              }
            onRow={(record) => ({
              onClick: () => router.push(`/audit-logs/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<ScrollText />}
                    title={t('auditLogs.emptyTitle')}
                    description={t('auditLogs.emptyDescription')}
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
                    <span
                      className="text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
                      {formatDisplayDateTime(value)}
                    </span>
                  ),
                },
                {
                  title: t('auditLogs.columns.user'),
                  key: 'user',
                  ellipsis: true,
                  responsive: ['md'],
                  render: (_value, record) => (
                    <span className="text-sm">
                      {formatAuditLogUserName(record)}
                    </span>
                  ),
                },
                {
                  title: t('auditLogs.columns.module'),
                  dataIndex: 'module',
                  key: 'module',
                  width: 130,
                  render: (value: string) => (
                    <span
                      className="text-xs font-medium"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {value}
                    </span>
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
                },
                {
                  title: t('auditLogs.columns.recordReference'),
                  dataIndex: 'recordReference',
                  key: 'recordReference',
                  ellipsis: true,
                  responsive: ['lg'],
                  render: (value: string | null) => value ?? '—',
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
                      <span className="font-[family-name:var(--font-mono)] text-xs">
                        {value}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                {
                  title: '',
                  key: 'actions',
                  width: 48,
                  render: (_value, record) => (
                    <div
                      className="flex items-center justify-end"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<EyeOutlined />}
                        aria-label={t('auditLogs.viewDetailsFor', {
                          module: record.module,
                        })}
                        onClick={() => router.push(`/audit-logs/${record.id}`)}
                        style={{ borderRadius: 0 }}
                      />
                    </div>
                  ),
                },
              ]}
            />
        </div>
      </div>
    </div>
  );
}
