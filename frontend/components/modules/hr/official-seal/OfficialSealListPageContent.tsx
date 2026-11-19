'use client';
import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';
import { accent } from '@/lib/theme/accent';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
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
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { OfficialSealListItem } from '@/lib/api/official-seal.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useOfficialSealsAll } from '@/lib/query/official-seal';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatOfficialSealEmployeeName,
  formatOfficialSealStatus,
  formatOfficialSealUrgency,
  officialSealStatusVariant,
} from '@/lib/utils/official-seal';
import {
  DRAFT_STATUSES,
  filterOfficialSeals,
  statusesForOfficialSealMode,
  type OfficialSealStatusMode,
} from '@/lib/utils/official-seal-list-filter';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { buildSealExportSheets } from '@/lib/utils/seal-export';
import { officialSealImportSchema } from '@/lib/utils/hr-import-configs';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

const LIST_PATH = '/hr/official-seal';
const NEW_PATH = '/approvals/new/official-seal';

const PENDING_STATUSES = statusesForOfficialSealMode('pending');
const APPROVED_STATUSES = statusesForOfficialSealMode('approved');
const REJECTED_STATUSES = statusesForOfficialSealMode('rejected');

const STAT_ACCENT = {
  teal: { bg: accent.light, fg: accent.primary },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
} as const;

function OfficialSealStat({
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
 * Official seal list - Users chrome (stat bar, filter row, soft table).
 */
export default function OfficialSealListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<OfficialSealStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const [importOpen, setImportOpen] = useState(false);

  const listQuery = useOfficialSealsAll({}, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    const scoped = filterOfficialSeals(allRows, {
      search: appliedSearch,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    });
    return {
      all: scoped.length,
      draft: scoped.filter((row) => DRAFT_STATUSES.includes(row.status)).length,
      pending: scoped.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      approved: scoped.filter((row) => APPROVED_STATUSES.includes(row.status))
        .length,
      rejected: scoped.filter((row) => REJECTED_STATUSES.includes(row.status))
        .length,
    };
  }, [allRows, appliedSearch, employeeId, dateRange, canViewHr]);

  const filtered = useMemo(
    () =>
      filterOfficialSeals(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewHr ? employeeId : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [allRows, appliedSearch, statusMode, employeeId, dateRange, canViewHr],
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

  const pageTitle = canViewHr
    ? t('pages.hr.officialSeal.listTitle')
    : t('pages.hr.officialSeal.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.officialSeal.listDescription')
    : t('pages.hr.officialSeal.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: OfficialSealStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const columns: ColumnsType<OfficialSealListItem> = useMemo(
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
        render: (_: unknown, row: OfficialSealListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {formatOfficialSealEmployeeName(row.employee)}
            </p>
            <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
              {isNarrow
                ? row.requestNumber
                : (row.employee?.email ?? row.fileName)}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.fileName'),
        dataIndex: 'fileName',
        key: 'fileName',
        ellipsis: true,
        responsive: ['sm'],
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.urgency'),
        dataIndex: 'urgency',
        key: 'urgency',
        width: 110,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatOfficialSealUrgency(value, t)}
          </span>
        ),
      },
      {
        title: t('hr.table.dateNeeded'),
        dataIndex: 'dateNeeded',
        key: 'dateNeeded',
        width: 120,
        responsive: ['lg'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 100 : 130,
        render: (value: OfficialSealListItem['status']) => (
          <StatusBadge
            label={formatOfficialSealStatus(value, t)}
            variant={officialSealStatusVariant(value)}
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
        render: (_: string | null | undefined, row: OfficialSealListItem) =>
          row.directApproved ? (
            <span className="erp-users-role-tag">
              {t('hr.labels.directApproval')}
            </span>
          ) : row.currentTierLabel ? (
            <span className="erp-users-role-tag">{row.currentTierLabel}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
    ],
    [isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-official-seal-page">
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-official-seal-page">
      {importOpen ? (
        <ImportModal
          schema={officialSealImportSchema}
          title={t('hr.exportImport.officialSeals.title')}
          description={t('hr.exportImport.officialSeals.description')}
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
            t('hr.messages.failedToLoadOfficialSeals'),
            t,
          )}
        />
      ) : null}

      <section
        className="erp-employees-hero"
        aria-labelledby="erp-list-hero-title"
      >
        <div className="erp-employees-hero-top">
          <h2 id="erp-list-hero-title" className="erp-employees-hero-title">
            {pageTitle}
          </h2>
          <div className="erp-employees-hero-actions">
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'seals',
                  label: t('hr.exportImport.officialSeals.export'),
                  filePrefix: 'official-seal-requests',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildSealExportSheets('official', filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={{
                label: t('hr.buttons.newOfficialSeal'),
                onClick: () => router.push(NEW_PATH),
              }}
            />
          </div>
        </div>
        <div className="erp-users-stat-bar erp-employees-hero-stats">
          <OfficialSealStat
            label={t('pages.hr.officialSeal.stats.total')}
            value={statusCounts.all}
            accent="teal"
            icon={<InboxOutlined />}
            active={statusMode === 'all'}
            onClick={() => handleStatusMode('all')}
          />
          {!canViewHr ? (
            <OfficialSealStat
              label={t('pages.hr.officialSeal.stats.draft')}
              value={statusCounts.draft}
              accent="blue"
              icon={<FormOutlined />}
              active={statusMode === 'draft'}
              onClick={() => handleStatusMode('draft')}
            />
          ) : null}
          <OfficialSealStat
            label={t('pages.hr.officialSeal.stats.pending')}
            value={statusCounts.pending}
            accent="amber"
            icon={<ClockCircleOutlined />}
            active={statusMode === 'pending'}
            onClick={() => handleStatusMode('pending')}
          />
          <OfficialSealStat
            label={t('pages.hr.officialSeal.stats.approved')}
            value={statusCounts.approved}
            accent="green"
            icon={<CheckCircleOutlined />}
            active={statusMode === 'approved'}
            onClick={() => handleStatusMode('approved')}
          />
          <OfficialSealStat
            label={t('pages.hr.officialSeal.stats.rejected')}
            value={statusCounts.rejected}
            accent="red"
            icon={<CloseCircleOutlined />}
            active={statusMode === 'rejected'}
            onClick={() => handleStatusMode('rejected')}
          />
        </div>
      </section>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <InboxOutlined />
            </span>
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
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.officialSeal.searchPlaceholder')}
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
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
              loading={usersQuery.isLoading}
              options={(usersQuery.data?.data ?? []).map((user) => ({
                value: user.id,
                label: formatUserName(user),
              }))}
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
          <DataTable<OfficialSealListItem>
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
                      ? t('pages.hr.officialSeal.emptyFiltered')
                      : t('hr.empty.noOfficialSealRequests')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newOfficialSeal'),
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
