'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Space, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import {
  filterLeavePolicies,
} from '@/lib/utils/leave-policy-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * HR leave policy configuration list with search and filters.
 */
export default function LeavePolicyListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const listQuery = useLeavePolicyList(canViewHr);
  const deleteMutation = useDeleteLeavePolicy();
  const refreshMutation = useRefreshLeaveBalances();
  const { params, resetPage, bindMeta } = useTablePagination();

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

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
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
      notifyApiError(
        error,
        t('hr.leavePolicy.deleteBlocked'),
        messageApi,
      );
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

  function handleQuery(): void {
    setAppliedSearch(search.trim());
    resetPage();
  }

  const columns: ColumnsType<LeavePolicy> = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.name'),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('hr.leavePolicy.governedBy'),
        dataIndex: 'governedBy',
        key: 'governedBy',
        ellipsis: true,
        render: (value: string | null) => value || '—',
      },
      {
        title: t('hr.leavePolicy.rules'),
        dataIndex: 'ruleCount',
        key: 'ruleCount',
        width: 100,
        align: 'right',
      },
      {
        title: t('hr.leavePolicy.employees'),
        dataIndex: 'employeeCount',
        key: 'employeeCount',
        width: 120,
        align: 'right',
      },
      {
        title: t('hr.leavePolicy.isActive'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <StatusBadge
            label={value ? t('common.active') : t('common.inactive')}
            variant={value ? 'success' : 'default'}
          />
        ),
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 100,
        render: (_: unknown, row: LeavePolicy) => (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<Pencil size={14} />}
              onClick={() => router.push(`/hr/leave-policy/${row.id}/edit`)}
              aria-label={t('common.update')}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash2 size={14} />}
              onClick={() => setDeleteId(row.id)}
              aria-label={t('common.delete')}
            />
          </Space>
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
      <div className="erp-pro-list-page">
        <div className="erp-pro-card">
          <div className="flex justify-center p-12">
            <Spin />
          </div>
        </div>
      </div>
    );
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    activeFilter !== undefined ||
    progressiveFilter !== undefined;

  return (
    <div className="erp-pro-list-page">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
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

      <div className="erp-pro-card">
        <div className="erp-pro-card-body">
          <div className="erp-pro-filter-form">
            <div className="erp-pro-filter-form-fields">
              <div
                className="erp-pro-filter-field"
                style={{ minWidth: 220, flex: '1 1 220px' }}
              >
                <span className="erp-pro-filter-field-label">
                  {t('common.search')}
                </span>
                <Input
                  placeholder={t('hr.leavePolicy.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onPressEnter={handleQuery}
                  allowClear
                  onClear={() => {
                    setSearch('');
                    setAppliedSearch('');
                    resetPage();
                  }}
                />
              </div>
              <div className="erp-pro-filter-field">
                <span className="erp-pro-filter-field-label">
                  {t('common.status')}
                </span>
                <Select
                  allowClear
                  placeholder={t('hr.leavePolicy.filterStatus')}
                  style={{ width: '100%', minWidth: 140 }}
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
              </div>
              <div className="erp-pro-filter-field">
                <span className="erp-pro-filter-field-label">
                  {t('hr.leavePolicy.isProgressive')}
                </span>
                <Select
                  allowClear
                  placeholder={t('hr.leavePolicy.filterProgressive')}
                  style={{ width: '100%', minWidth: 140 }}
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
              </div>
            </div>
            <div className="erp-pro-filter-form-actions">
              <Button onClick={handleResetFilters} style={{ borderRadius: 2 }}>
                {t('common.reset')}
              </Button>
              {/* <Button
                type="primary"
                onClick={handleQuery}
                style={{ borderRadius: 2 }}
              >
                {t('common.query')}
              </Button> */}
            </div>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <h1
            className="erp-pro-card-toolbar-title"
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {t('hr.leavePolicy.listTitle')}
          </h1>
          <Space wrap size={8}>
            {/* <Button
              icon={<ReloadOutlined />}
              loading={refreshMutation.isPending}
              onClick={() => void handleRefreshBalances()}
              style={{ borderRadius: 2 }}
            >
              {t('hr.leavePolicy.refreshBalances')}
            </Button> */}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/hr/leave-policy/new')}
              style={{ borderRadius: 2 }}
            >
              {t('hr.leavePolicy.new')}
            </Button>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 2 }}
            />
          </Space>
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<LeavePolicy>
            rowKey="id"
            className="erp-pro-table"
            size="middle"
            columns={columns}
            dataSource={pageRows}
            pagination={bindMeta(meta)}
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
