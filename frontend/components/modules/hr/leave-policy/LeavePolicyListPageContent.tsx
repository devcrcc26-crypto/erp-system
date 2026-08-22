'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeavePolicy } from '@/lib/api/leave-policy.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeleteLeavePolicy,
  useLeavePolicyList,
  useRefreshLeaveBalances,
} from '@/lib/query/leave-policy';
import { tokens } from '@/lib/theme/tokens';
import { filterLeavePolicies } from '@/lib/utils/leave-policy-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * HR leave policy list — layout aligned with Users page.
 */
export default function LeavePolicyListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const listQuery = useLeavePolicyList(canViewHr);
  const deleteMutation = useDeleteLeavePolicy();
  const refreshMutation = useRefreshLeaveBalances();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>();
  const [progressiveFilter, setProgressiveFilter] = useState<
    boolean | undefined
  >();

  const filtered = useMemo(
    () =>
      filterLeavePolicies(listQuery.data ?? [], {
        search: appliedSearch,
        isActive: activeFilter,
        isProgressive: progressiveFilter,
      }),
    [listQuery.data, appliedSearch, activeFilter, progressiveFilter],
  );

  const stats = useMemo(() => {
    const all = listQuery.data ?? [];
    return {
      total: all.length,
      active: all.filter((p) => p.isActive).length,
      inactive: all.filter((p) => !p.isActive).length,
      progressive: all.filter((p) =>
        p.rules.some((r) => r.leaveType === 'ANNUAL' && r.isProgressive),
      ).length,
    };
  }, [listQuery.data]);

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const pageRows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  async function handleDelete(): Promise<void> {
    if (!deleteId) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteId);
      messageApi.success(t('hr.leavePolicy.deleted'));
      setDeleteId(null);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.leavePolicy.deleteBlocked'), messageApi);
    }
  }

  async function handleRefreshBalances(): Promise<void> {
    try {
      const result = await refreshMutation.mutateAsync(
        new Date().getFullYear(),
      );
      messageApi.success(
        t('hr.leavePolicy.refreshed', { count: result.refreshed }),
      );
    } catch (error: unknown) {
      notifyApiError(error, t('hr.leavePolicy.refreshFailed'), messageApi);
    }
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setActiveFilter(undefined);
    setProgressiveFilter(undefined);
    resetPage();
  }

  function buildActionMenu(row: LeavePolicy): MenuProps['items'] {
    return [
      {
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/hr/leave-policy/${row.id}/edit`),
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleteId(row.id),
      },
    ];
  }

  const columns: ColumnsType<LeavePolicy> = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.name'),
        dataIndex: 'name',
        key: 'name',
        render: (_: unknown, row: LeavePolicy) => (
          <div className="min-w-0 py-0.5">
            <p
              className="m-0 text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.name}
            </p>
            {row.description ? (
              <p
                className="m-0 truncate text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {row.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.leavePolicy.governedBy'),
        dataIndex: 'governedBy',
        key: 'governedBy',
        ellipsis: true,
        responsive: ['lg'],
        render: (value: string | null) => value || '—',
      },
      {
        title: t('hr.leavePolicy.rules'),
        dataIndex: 'ruleCount',
        key: 'ruleCount',
        width: 100,
        align: 'right',
        responsive: ['md'],
      },
      {
        title: t('hr.leavePolicy.employees'),
        dataIndex: 'employeeCount',
        key: 'employeeCount',
        width: 120,
        align: 'right',
        responsive: ['md'],
      },
      {
        title: t('common.status'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: 110,
        render: (value: boolean) => (
          <StatusBadge
            label={value ? t('common.active') : t('common.inactive')}
            variant={value ? 'success' : 'default'}
          />
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        render: (_: unknown, row: LeavePolicy) => (
          <div
            className="flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items: buildActionMenu(row) }}
              trigger={['click']}
            >
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
                style={{ borderRadius: 0 }}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [router, t],
  );

  if (!canViewHr) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    activeFilter !== undefined ||
    progressiveFilter !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.leavePolicy.loadError')
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('hr.leavePolicy.deleteTitle')}
        description={t('hr.leavePolicy.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {t('hr.leavePolicy.listTitle')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('hr.leavePolicy.formDescription')}
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total"
          value={stats.total}
          color="teal"
          icon={<FileTextOutlined />}
        />
        <StatCard
          label="Active"
          value={stats.active}
          color="green"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label="Inactive"
          value={stats.inactive}
          color="default"
          icon={<StopOutlined />}
        />
        <StatCard
          label="Progressive"
          value={stats.progressive}
          color="blue"
          icon={<ReloadOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('hr.leavePolicy.searchPlaceholder')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <Select
            allowClear
            placeholder={t('hr.leavePolicy.filterStatus')}
            className="w-full min-w-0 sm:w-36"
            value={activeFilter}
            onChange={(value?: boolean) => {
              setActiveFilter(value);
              resetPage();
            }}
            options={[
              { value: true, label: t('common.active') },
              { value: false, label: t('common.inactive') },
            ]}
          />
          <Select
            allowClear
            placeholder={t('hr.leavePolicy.filterProgressive')}
            className="w-full min-w-0 sm:w-40"
            value={progressiveFilter}
            onChange={(value?: boolean) => {
              setProgressiveFilter(value);
              resetPage();
            }}
            options={[
              { value: true, label: t('common.yes') },
              { value: false, label: t('common.no') },
            ]}
          />
          <Button
            onClick={handleResetFilters}
            disabled={!hasFilters}
            style={{ borderRadius: 0 }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FileTextOutlined style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('hr.leavePolicy.listTitle')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {meta.total === 1
                ? t('hr.leavePolicy.policyCountOne')
                : t('hr.leavePolicy.policyCount', { count: meta.total })}
            </span>
          </div>
          <Space wrap size={8}>
            {/* <Button
              icon={<ReloadOutlined />}
              loading={refreshMutation.isPending}
              onClick={() => void handleRefreshBalances()}
              style={{ borderRadius: 0 }}
            >
              {t('hr.leavePolicy.refreshBalances')}
            </Button> */}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/leave-policy/new')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.leavePolicy.new')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<LeavePolicy>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={pageRows}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/leave-policy/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileText />}
                  title={
                    hasFilters
                      ? t('hr.leavePolicy.emptyFiltered')
                      : t('hr.leavePolicy.empty')
                  }
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.leavePolicy.new'),
                          onClick: () => router.push('/hr/leave-policy/new'),
                        }
                  }
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
