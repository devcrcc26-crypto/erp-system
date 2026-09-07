'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Input,
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
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { LeavePolicy } from '@/lib/api/leave-policy.types';
import type { PaginationMeta } from '@/lib/api/types';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { useDeleteLeavePolicy, useLeavePolicyList } from '@/lib/query/leave-policy';
import { buildLeavePolicyExportSheets } from '@/lib/utils/leave-policy-export';
import { leavePolicyImportSchema } from '@/lib/utils/hr-import-configs';
import {
  filterLeavePolicies,
  type LeavePolicyStatusMode,
} from '@/lib/utils/leave-policy-list-filter';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/leave-policy';
const NEW_PATH = '/hr/leave-policy/new';

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  gray: { bg: '#F0F1F3', fg: '#5F6B7A' },
} as const;

function LeavePolicyStat({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <button
      type="button"
      className={`erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}`}
      onClick={onClick}
    >
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
    </button>
  );
}

/**
 * Leave policy list — Users chrome (stat bar, filter row, soft table).
 */
export default function LeavePolicyListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const [importOpen, setImportOpen] = useState(false);
  const listQuery = useLeavePolicyList(canViewHr);
  const deleteMutation = useDeleteLeavePolicy();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<LeavePolicyStatusMode>('all');

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    return {
      all: allRows.length,
      active: allRows.filter((policy) => policy.isActive).length,
      inactive: allRows.filter((policy) => !policy.isActive).length,
      progressive: allRows.filter((policy) =>
        policy.rules.some(
          (rule) => rule.leaveType === 'ANNUAL' && rule.isProgressive,
        ),
      ).length,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterLeavePolicies(allRows, {
        search: appliedSearch,
        statusMode,
      }),
    [allRows, appliedSearch, statusMode],
  );

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

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    resetPage();
  }

  function handleStatusMode(mode: LeavePolicyStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  function buildActionMenu(row: LeavePolicy): MenuProps['items'] {
    return [
      {
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`${LIST_PATH}/${row.id}/edit`),
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

  const hasFilters =
    Boolean(appliedSearch.trim()) || statusMode !== 'all';

  const columns: ColumnsType<LeavePolicy> = useMemo(
    () => [
      {
        title: t('hr.leavePolicy.name'),
        dataIndex: 'name',
        key: 'name',
        render: (_: unknown, row: LeavePolicy) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{row.name}</p>
            {row.description ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
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
        render: (value: string | null) => (
          <span className="erp-users-cell-sub">{value || '—'}</span>
        ),
      },
      {
        title: t('hr.leavePolicy.rules'),
        dataIndex: 'ruleCount',
        key: 'ruleCount',
        width: 100,
        align: 'right',
        responsive: ['md'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.leavePolicy.employees'),
        dataIndex: 'employeeCount',
        key: 'employeeCount',
        width: 120,
        align: 'right',
        responsive: ['md'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('common.status'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: isNarrow ? 100 : 110,
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
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [isNarrow, router, t],
  );

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-leave-policy-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-leave-policy-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-leave-policy-page">
      {importOpen ? (
        <ImportModal
          schema={leavePolicyImportSchema}
          title={t('hr.exportImport.leavePolicies.title')}
          description={t('hr.exportImport.leavePolicies.description')}
          onClose={() => setImportOpen(false)}
          onImported={() => void listQuery.refetch()}
        />
      ) : null}

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.leavePolicy.loadError'),
            t,
          )}
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

      <div className="erp-users-stat-bar">
        <LeavePolicyStat
          label={t('hr.leavePolicy.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<FileTextOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <LeavePolicyStat
          label={t('hr.leavePolicy.stats.active')}
          value={statusCounts.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <LeavePolicyStat
          label={t('hr.leavePolicy.stats.inactive')}
          value={statusCounts.inactive}
          accent="gray"
          icon={<StopOutlined />}
          active={statusMode === 'inactive'}
          onClick={() => handleStatusMode('inactive')}
        />
        <LeavePolicyStat
          label={t('hr.leavePolicy.stats.progressive')}
          value={statusCounts.progressive}
          accent="amber"
          icon={<ReloadOutlined />}
          active={statusMode === 'progressive'}
          onClick={() => handleStatusMode('progressive')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.leavePolicy.listTitle')}
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
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'policies',
                  label: t('hr.exportImport.leavePolicies.export'),
                  filePrefix: 'leave-policies',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildLeavePolicyExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.leavePolicy.new'),
                onClick: () => router.push(NEW_PATH),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.leavePolicy.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<LeavePolicy>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={pageRows}
            loading={listQuery.isFetching && pageRows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 960 }}
            onRow={(record) => ({
              onClick: () => router.push(`${LIST_PATH}/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileText />}
                  title={
                    hasFilters
                      ? t('hr.leavePolicy.emptyFiltered')
                      : t('hr.leavePolicy.empty')
                  }
                  description={t('pages.hr.leavePolicy.listDescription')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.leavePolicy.new'),
                          onClick: () => router.push(NEW_PATH),
                        }
                  }
                />
              ),
            }}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: isNarrow,
              showSizeChanger: !isNarrow,
            }}
          />
        </div>
      </div>
    </div>
  );
}
