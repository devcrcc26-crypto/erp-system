'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { AuditOutlined } from '@ant-design/icons';
import { ScrollText } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import AuditLogDetailDrawer from '@/components/modules/audit/AuditLogDetailDrawer';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { AuditLog, AuditLogSource } from '@/lib/api/types';
import { useAuditLogs } from '@/lib/query/audit-logs';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';
import { layout } from '@/lib/theme/layout';

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function formatLogUserName(log: AuditLog): string {
  if (!log.user) {
    return '-';
  }
  return formatUserName(log.user);
}

function sourceVariant(
  source: AuditLogSource,
): 'default' | 'info' | 'warning' | 'success' {
  switch (source) {
    case 'USER_ACTION':
      return 'info';
    case 'SYSTEM_JOB':
      return 'warning';
    case 'API_INTEGRATION':
      return 'success';
    case 'MIGRATION':
      return 'default';
    default:
      return 'default';
  }
}

export default function AuditLogsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const queryParams = {
    ...params,
    sortBy: 'createdAt',
    sortOrder: 'desc' as const,
    module: moduleFilter.trim() || undefined,
    action: actionFilter.trim() || undefined,
    userId: userIdFilter,
    dateFrom: dateFrom?.startOf('day').toISOString(),
    dateTo: dateTo?.endOf('day').toISOString(),
  };

  const auditLogsQuery = useAuditLogs(queryParams);
  const usersDirectoryQuery = useUsersDirectory(
    { page: 1, limit: USER_DIRECTORY_PAGE_LIMIT },
    { enabled: auditLogsQuery.isSuccess },
  );

  const userOptions = useMemo(
    () =>
      (usersDirectoryQuery.data?.data ?? []).map((user) => ({
        value: user.id,
        label: formatUserName(user),
      })),
    [usersDirectoryQuery.data?.data],
  );

  const columns: ColumnsType<AuditLog> = useMemo(
    () => [
      {
        title: t('auditLogs.columns.timestamp'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (value: string) => formatTimestamp(value),
      },
      {
        title: t('auditLogs.columns.user'),
        key: 'user',
        ellipsis: true,
        render: (_value, record) => formatLogUserName(record),
      },
      {
        title: t('auditLogs.columns.module'),
        dataIndex: 'module',
        key: 'module',
        width: 140,
      },
      {
        title: t('auditLogs.columns.action'),
        dataIndex: 'action',
        key: 'action',
        width: 100,
        render: (value: string) => (
          <StatusBadge label={value} variant="default" />
        ),
      },
      {
        title: t('auditLogs.columns.recordType'),
        dataIndex: 'recordType',
        key: 'recordType',
        ellipsis: true,
      },
      {
        title: t('auditLogs.columns.recordReference'),
        dataIndex: 'recordReference',
        key: 'recordReference',
        ellipsis: true,
        render: (value: string | null) => value ?? '-',
      },
      {
        title: t('auditLogs.columns.source'),
        dataIndex: 'source',
        key: 'source',
        width: 140,
        render: (source: AuditLogSource) => (
          <StatusBadge
            label={t(`auditLogs.source.${source}`)}
            variant={sourceVariant(source)}
          />
        ),
      },
      {
        title: t('auditLogs.columns.ipAddress'),
        dataIndex: 'ipAddress',
        key: 'ipAddress',
        width: 130,
        render: (value: string | null) => value ?? '-',
      },
      {
        title: '',
        key: 'actions',
        width: 90,
        render: (_value, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedLog(record)}
          >
            {t('auditLogs.viewDetails')}
          </Button>
        ),
      },
    ],
    [t],
  );

  if (auditLogsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  if (auditLogsQuery.isError) {
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
  const meta = auditLogsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title={t('auditLogs.title')}
        description={t('auditLogs.description')}
      >
        <Space wrap className="!mb-4">
          <Input
            allowClear
            placeholder={t('auditLogs.filters.module')}
            className={layout.filterControl}
            value={moduleFilter}
            onChange={(event) => {
              resetPage();
              setModuleFilter(event.target.value);
            }}
          />
          <Input
            allowClear
            placeholder={t('auditLogs.filters.action')}
            className={layout.filterControl}
            value={actionFilter}
            onChange={(event) => {
              resetPage();
              setActionFilter(event.target.value);
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('auditLogs.filters.user')}
            className={layout.filterControl}
            options={userOptions}
            value={userIdFilter}
            loading={usersDirectoryQuery.isLoading}
            onChange={(value: string | undefined) => {
              resetPage();
              setUserIdFilter(value);
            }}
          />
          <DatePicker
            placeholder={t('auditLogs.filters.dateFrom')}
            value={dateFrom}
            onChange={(value: Dayjs | null) => {
              resetPage();
              setDateFrom(value);
            }}
          />
          <DatePicker
            placeholder={t('auditLogs.filters.dateTo')}
            value={dateTo}
            onChange={(value: Dayjs | null) => {
              resetPage();
              setDateTo(value);
            }}
          />
        </Space>

        <p className="!mb-4 text-sm text-slate-500">
          {meta
            ? t('auditLogs.entryCount', { count: meta.total })
            : null}
        </p>

        <DataTable<AuditLog>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedLog(record),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<AuditOutlined />}
                title={t('auditLogs.emptyTitle')}
                description={t('auditLogs.emptyDescription')}
              />
            ),
          }}
        />
      </FormLayout>

      <AuditLogDetailDrawer
        log={selectedLog}
        open={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
      />
    </>
  );
}
