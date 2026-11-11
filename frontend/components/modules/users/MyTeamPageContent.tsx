'use client';

import { useMemo, useState } from 'react';
import { Button, Grid, Input, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { User } from '@/lib/api/types';
import { useUsers } from '@/lib/query/users';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * My Team: everyone below the viewer in the reporting chain (direct and
 * indirect). The backend scopes `/users` to that chain for supervisors
 * without users.view; each row opens the employee's profile.
 */
export default function MyTeamPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewTeam = useCanViewTeam();
  const { params, resetPage, bindMeta } = useTablePagination(20);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const listQuery = useUsers(
    { ...params, search: appliedSearch || undefined },
    { enabled: canViewTeam },
  );
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<User> = useMemo(
    () => [
      {
        title: t('pages.hr.myTeam.columns.employeeId'),
        key: 'employeeId',
        width: 130,
        render: (_: unknown, row: User) => (
          <span className="erp-users-id-chip">{row.employeeId ?? '-'}</span>
        ),
      },
      {
        title: t('hr.table.employee'),
        key: 'employee',
        render: (_: unknown, row: User) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <EvaluationListAvatar
              firstName={row.firstName}
              lastName={row.lastName}
              userId={row.id}
            />
            <div className="min-w-0">
              <p className="erp-users-name m-0 truncate">{formatUserName(row)}</p>
              {row.email ? (
                <p className="erp-users-email m-0 mt-0.5 truncate">{row.email}</p>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        title: t('hr.table.department'),
        key: 'department',
        responsive: ['md'],
        render: (_: unknown, row: User) => (
          <span className="erp-users-cell-sub">{row.department?.name ?? '-'}</span>
        ),
      },
      {
        title: t('pages.hr.myTeam.columns.position'),
        key: 'position',
        responsive: ['md'],
        render: (_: unknown, row: User) => (
          <span className="erp-users-cell-sub">{row.position?.title ?? '-'}</span>
        ),
      },
      {
        title: t('pages.hr.myTeam.columns.reportsTo'),
        key: 'reportsTo',
        responsive: ['lg'],
        render: (_: unknown, row: User) => (
          <span className="erp-users-cell-sub">
            {row.reportsTo ? formatUserName(row.reportsTo) : '-'}
          </span>
        ),
      },
    ],
    [t],
  );

  if (!canViewTeam) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page">
      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-0"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('pages.hr.myTeam.loadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{t('pages.hr.myTeam.title')}</h3>
            <span className="erp-users-count-pill">
              {(meta?.total ?? rows.length).toLocaleString()}
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
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.myTeam.search')}
            aria-label={t('pages.hr.myTeam.search')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<User>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching}
            scroll={{ x: isNarrow ? 560 : 900 }}
            onRow={(row) => ({
              onClick: () => router.push(`/users/${row.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Users />}
                  title={
                    appliedSearch
                      ? t('pages.hr.myTeam.emptyFiltered')
                      : t('pages.hr.myTeam.empty')
                  }
                  description={t('pages.hr.myTeam.description')}
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
