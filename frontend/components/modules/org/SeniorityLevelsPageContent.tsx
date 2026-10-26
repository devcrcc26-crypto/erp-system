'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';
import './org-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Spin,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  RiseOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { OrgListStat } from '@/components/modules/org/OrgListStat';
import SeniorityLevelFormDrawer from '@/components/modules/org/SeniorityLevelFormDrawer';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  useDeleteSeniorityLevel,
  useSeniorityLevels,
  type SeniorityLevel,
} from '@/lib/query/org';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PAGE_CHROME =
  `erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-org-positions-page erp-org-v2 ${LIST_PAGE_V2}`;

type StatusMode = 'all' | 'active' | 'inactive';

/**
 * Seniority levels (Junior / Middle / Senior …) that HR assigns on the
 * employee form. Same access as Positions (departments.view / manage).
 */
export default function SeniorityLevelsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const messageApi = useAppMessage();
  const [editing, setEditing] = useState<SeniorityLevel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<SeniorityLevel | null>(null);
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');

  useSetHeaderExtra(null);

  const levelsQuery = useSeniorityLevels({}, canView);
  const deleteLevel = useDeleteSeniorityLevel();
  const rows = useMemo(() => levelsQuery.data ?? [], [levelsQuery.data]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.isActive).length;
    return {
      total: rows.length,
      active,
      inactive: rows.length - active,
      people: rows.reduce((sum, row) => sum + (row._count?.users ?? 0), 0),
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusMode === 'active' && !row.isActive) return false;
      if (statusMode === 'inactive' && row.isActive) return false;
      if (!query) return true;
      return (
        row.name.toLowerCase().includes(query) ||
        (row.nameZh?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [rows, search, statusMode]);

  const hasFilters = statusMode !== 'all' || search.trim() !== '';
  const nextSortOrder = rows.length
    ? Math.max(...rows.map((row) => row.sortOrder)) + 1
    : 1;

  function openDrawer(level: SeniorityLevel | null): void {
    setEditing(level);
    setDrawerOpen(true);
  }

  function closeDrawer(): void {
    setDrawerOpen(false);
    setEditing(null);
  }

  function buildActionMenu(record: SeniorityLevel): MenuProps['items'] {
    const items: MenuProps['items'] = [
      {
        key: 'edit',
        icon: canManage ? <EditOutlined /> : <EyeOutlined />,
        label: canManage ? t('common.update') : t('common.view'),
        onClick: () => openDrawer(record),
      },
    ];
    if (canManage) {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleting(record),
      });
    }
    return items;
  }

  const columns: ColumnsType<SeniorityLevel> = [
    {
      title: t('pages.seniorityLevels.table.order'),
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      render: (value: number) => <span className="erp-users-id-chip">{value}</span>,
    },
    {
      title: t('pages.seniorityLevels.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (value: string, row) => (
        <div className="min-w-0">
          <p className="erp-users-name m-0">{value}</p>
          {row.nameZh ? (
            <p className="erp-users-cell-sub m-0 truncate">{row.nameZh}</p>
          ) : null}
        </div>
      ),
    },
    {
      title: t('pages.seniorityLevels.table.people'),
      key: 'people',
      width: isNarrow ? 80 : 110,
      align: 'right',
      render: (_value, row) => {
        const count = row._count?.users ?? 0;
        return (
          <span className={count > 0 ? 'erp-users-cell-strong' : 'erp-users-cell-sub'}>
            {count.toLocaleString()}
          </span>
        );
      },
    },
    {
      title: t('common.status'),
      key: 'isActive',
      width: 110,
      render: (_value, row) => (
        <StatusBadge
          label={row.isActive ? t('common.active') : t('common.inactive')}
          variant={row.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (_value, row) => (
        <div
          className="erp-table-row-actions flex items-center justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: buildActionMenu(row) }}
            trigger={['click']}
            rootClassName="erp-row-actions-menu"
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
  ];

  if (permLoading || (levelsQuery.isLoading && rows.length === 0 && canView)) {
    return (
      <div className={PAGE_CHROME}>
        <div className="erp-org-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={PAGE_CHROME}>
        <Alert type="warning" showIcon title={t('pages.seniorityLevels.accessDenied')} />
      </div>
    );
  }

  if (levelsQuery.isError) {
    return (
      <div className={PAGE_CHROME}>
        <Alert type="error" showIcon title={t('pages.seniorityLevels.loadFailed')} />
      </div>
    );
  }

  return (
    <div className={PAGE_CHROME}>
      <div className="erp-users-stat-bar">
        <OrgListStat
          label={t('pages.positions.stats.total')}
          value={stats.total}
          accent="blue"
          icon={<RiseOutlined />}
          active={statusMode === 'all'}
          onClick={() => setStatusMode('all')}
        />
        <OrgListStat
          label={t('common.active')}
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => setStatusMode('active')}
        />
        <OrgListStat
          label={t('common.inactive')}
          value={stats.inactive}
          accent="slate"
          icon={<StopOutlined />}
          active={statusMode === 'inactive'}
          onClick={() => setStatusMode('inactive')}
        />
        <OrgListStat
          label={t('pages.seniorityLevels.stats.peopleAssigned')}
          value={stats.people}
          accent="teal"
          icon={<TeamOutlined />}
        />
      </div>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.seniorityLevels.title')}
            </h3>
            <span className="erp-users-count-pill">
              {visibleRows.length.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Link
              href="/positions"
              className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium !text-slate-600 no-underline hover:!text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('nav.positions')}
            </Link>
            {canManage ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openDrawer(null)}
                aria-label={t('pages.seniorityLevels.add')}
              >
                {isNarrow ? undefined : t('pages.seniorityLevels.add')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.seniorityLevels.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('pages.seniorityLevels.searchPlaceholder')}
          />
          {hasFilters ? (
            <Button
              type="link"
              onClick={() => {
                setSearch('');
                setStatusMode('all');
              }}
              className="!px-1"
            >
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<SeniorityLevel>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isNarrow ? 'small' : 'middle'}
            columns={columns}
            dataSource={visibleRows}
            loading={levelsQuery.isFetching && rows.length === 0}
            pagination={false}
            onRow={(record) => ({
              onClick: () => openDrawer(record),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: hasFilters ? (
                <TableEmptyState
                  icon={<SearchOutlined />}
                  title={t('pages.seniorityLevels.noMatches')}
                />
              ) : (
                <TableEmptyState
                  icon={<RiseOutlined />}
                  title={t('pages.seniorityLevels.empty')}
                  description={t('pages.seniorityLevels.description')}
                  action={
                    canManage
                      ? { label: t('pages.seniorityLevels.add'), onClick: () => openDrawer(null) }
                      : undefined
                  }
                />
              ),
            }}
          />
        </div>
      </div>

      <SeniorityLevelFormDrawer
        open={drawerOpen}
        editing={editing}
        readOnly={!canManage}
        nextSortOrder={nextSortOrder}
        onClose={closeDrawer}
      />

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={Boolean(deleting)}
        title={t('pages.seniorityLevels.deleteTitle')}
        description={
          deleting
            ? t('pages.seniorityLevels.deleteDescription', { name: deleting.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteLevel.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteLevel
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success(t('pages.seniorityLevels.deleted'));
              setDeleting(null);
            })
            .catch((error: unknown) => {
              notifyApiError(error, t('pages.seniorityLevels.deleteFailed'), messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
