'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FilePdfOutlined,
  FormOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  ExitPermitDirection,
  ExitPermitListItem,
} from '@/lib/api/exit-permit.types';
import type { PaginationMeta } from '@/lib/api/types';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import {
  fetchExitPermitDetails,
  useExitPermitsAll,
} from '@/lib/query/exit-permit';
import { buildExitPermitExportSheets } from '@/lib/utils/exit-permit-export';
import { exitPermitImportSchema } from '@/lib/utils/hr-import-configs';
import { useUsersDirectory } from '@/lib/query/users';
import {
  exitPermitStatusVariant,
  formatExitPermitDepartmentName,
  formatExitPermitDirection,
  formatExitPermitEmployeeName,
  formatExitPermitStatus,
} from '@/lib/utils/exit-permit-display';
import {
  DRAFT_STATUSES,
  filterExitPermits,
  statusesForExitPermitMode,
  type ExitPermitStatusMode,
} from '@/lib/utils/exit-permit-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import ExitPermitGateRegisterModal from '@/components/modules/hr/exit-permit/ExitPermitGateRegisterModal';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
const LIST_PATH = '/hr/equipment-and-materials-exit-permit';
const NEW_PATH = '/approvals/new/exit-permit';

const PENDING_STATUSES = statusesForExitPermitMode('pending');
const APPROVED_STATUSES = statusesForExitPermitMode('approved');
const REJECTED_STATUSES = statusesForExitPermitMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function ExitPermitStat({
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
 * Exit permit list - Users chrome (stat bar, filter row, soft table).
 */
export default function ExitPermitListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  // Supervisors see their team's rows (backend-scoped); HR tools stay HR-only.
  const canViewTeam = useCanViewTeam();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<ExitPermitStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const [importOpen, setImportOpen] = useState(false);
  const [gateRegisterOpen, setGateRegisterOpen] = useState(false);

  const listQuery = useExitPermitsAll({}, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  // HR picks from the directory; supervisors from the people in their list.
  const employeeOptions = useMemo(
    () =>
      canViewHr
        ? (usersQuery.data?.data ?? []).map((user) => ({
            value: user.id,
            label: formatUserName(user),
          }))
        : teamEmployeeOptions(allRows),
    [canViewHr, usersQuery.data, allRows],
  );

  const statusCounts = useMemo(() => {
    return {
      all: allRows.length,
      draft: allRows.filter((row) => DRAFT_STATUSES.includes(row.status)).length,
      pending: allRows.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      approved: allRows.filter((row) => APPROVED_STATUSES.includes(row.status))
        .length,
      rejected: allRows.filter((row) => REJECTED_STATUSES.includes(row.status))
        .length,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterExitPermits(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewTeam ? employeeId : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [allRows, appliedSearch, statusMode, employeeId, dateRange, canViewTeam],
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

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const pageTitle = canViewTeam
    ? t('pages.hr.exitPermit.listTitle')
    : t('pages.hr.exitPermit.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.exitPermit.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
      : t('pages.hr.exitPermit.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: ExitPermitStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<ExitPermitListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isNarrow ? undefined : 200,
        render: (_: unknown, row: ExitPermitListItem) => (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="erp-users-cell-strong m-0 truncate">
                {formatExitPermitEmployeeName(row.employee)}
              </p>
              {row.isOnBehalf ? (
                <Tag color="blue" className="m-0">
                  {t('hr.table.onBehalf')}
                </Tag>
              ) : null}
            </div>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {isNarrow
                ? row.requestNumber
                : formatExitPermitDepartmentName(row.department)}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.direction'),
        dataIndex: 'direction',
        key: 'direction',
        width: 110,
        responsive: ['sm'],
        render: (value: ExitPermitDirection) => (
          <Tag color={value === 'ENTRANCE' ? 'green' : 'red'}>
            {formatExitPermitDirection(value, t)}
          </Tag>
        ),
      },
      {
        title: t('hr.table.date'),
        dataIndex: 'date',
        key: 'date',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.department'),
        key: 'department',
        width: 160,
        ellipsis: true,
        responsive: ['lg'],
        render: (_: unknown, row: ExitPermitListItem) => (
          <span className="erp-users-cell-sub">
            {formatExitPermitDepartmentName(row.department)}
          </span>
        ),
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 80,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 100 : 130,
        render: (value: ExitPermitListItem['status']) => (
          <StatusBadge
            label={formatExitPermitStatus(value, t)}
            variant={exitPermitStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        responsive: ['xl'],
        render: (value: string | null | undefined) =>
          value ? (
            <span className="erp-users-role-tag">{value}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
    ],
    [isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-exit-permit-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-exit-permit-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={exitPermitImportSchema}
          title={t('hr.exportImport.exitPermits.title')}
          description={t('hr.exportImport.exitPermits.description')}
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
            t('hr.messages.exitPermitLoadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <ExitPermitStat
          label={t('pages.hr.exitPermit.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<InboxOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <ExitPermitStat
            label={t('pages.hr.exitPermit.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <ExitPermitStat
          label={t('pages.hr.exitPermit.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <ExitPermitStat
          label={t('pages.hr.exitPermit.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <ExitPermitStat
          label={t('pages.hr.exitPermit.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
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
              extra={
                canViewHr ? (
                  <Button
                    icon={<FilePdfOutlined />}
                    onClick={() => setGateRegisterOpen(true)}
                    aria-label={t('hr.exportImport.exitPermits.gateRegister')}
                    data-shot="exit-permit-gate-register"
                  >
                    {isCompact
                      ? null
                      : t('hr.exportImport.exitPermits.gateRegister')}
                  </Button>
                ) : undefined
              }
              extraMenuItems={
                canViewHr
                  ? [
                      {
                        key: 'gate-register',
                        icon: <FilePdfOutlined />,
                        label: t('hr.exportImport.exitPermits.gateRegister'),
                        onClick: () => setGateRegisterOpen(true),
                      },
                    ]
                  : []
              }
              exports={[
                {
                  key: 'permits',
                  label: t('hr.exportImport.exitPermits.export'),
                  filePrefix: 'exit-permits',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildExitPermitExportSheets(filtered),
                },
                {
                  key: 'permits-with-items',
                  label: t('hr.exportImport.exitPermits.exportWithItems'),
                  filePrefix: 'exit-permits-with-items',
                  disabled: filtered.length === 0,
                  buildSheets: async () =>
                    buildExitPermitExportSheets(
                      filtered,
                      await fetchExitPermitDetails(
                        filtered.map((row) => row.id),
                      ),
                    ),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.buttons.newExitPermit'),
                onClick: () => router.push(NEW_PATH),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.exitPermit.searchPlaceholder')}
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
          {canViewTeam ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
              loading={canViewHr ? usersQuery.isLoading : listQuery.isLoading}
              options={employeeOptions}
              value={employeeId}
              onChange={(value: string | undefined) => {
                setEmployeeId(value);
                resetPage();
              }}
            />
          ) : null}
          <DatePicker.RangePicker
            value={dateRange}
            className="erp-users-filter-daterange"
            onChange={(value) => {
              setDateRange(value);
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
          <DataTable<ExitPermitListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
            onRow={(record) => ({
              onClick: () => router.push(`${LIST_PATH}/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<InboxOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.exitPermit.emptyFiltered')
                      : t('hr.empty.exitPermit')
                  }
                  description={
                    hasFilters
                      ? pageDescription
                      : t('hr.empty.exitPermitDescription')
                  }
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newExitPermit'),
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

      {canViewHr ? (
        <ExitPermitGateRegisterModal
          open={gateRegisterOpen}
          onClose={() => setGateRegisterOpen(false)}
          listRows={allRows}
        />
      ) : null}
    </div>
  );
}
