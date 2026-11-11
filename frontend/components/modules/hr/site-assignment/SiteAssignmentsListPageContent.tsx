'use client';

import './site-assignments-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  SiteAssignmentListItem,
  SiteAssignmentStatus,
} from '@/lib/api/site-assignment.types';
import { useSiteAssignments } from '@/lib/query/site-assignment';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSiteAssignmentProject,
  siteAssignmentStatusVariant,
} from '@/lib/utils/site-assignment-display';
import { formatUserName } from '@/lib/utils/user-display';

type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: SiteAssignmentStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: SiteAssignmentStatus[] = ['APPROVED'];
const REJECTED_STATUSES: SiteAssignmentStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusMode): SiteAssignmentStatus[] | undefined {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'approved':
      return APPROVED_STATUSES;
    case 'rejected':
      return REJECTED_STATUSES;
    default:
      return undefined;
  }
}

/**
 * Site assignments list - Employees / leave v2 chrome.
 */
export default function SiteAssignmentsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const { params, resetPage, bindMeta } = useTablePagination(20);

  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [siteFilter, setSiteFilter] = useState('');
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<Dayjs | null>(null);

  const statusList = statusesForMode(statusMode);
  // API accepts a single status; when mode has multiple, fetch all and filter client-side.
  const apiStatus =
    statusList && statusList.length === 1 ? statusList[0] : undefined;

  const listParams = useMemo(
    () => ({
      page: params.page,
      limit: params.limit,
      status: apiStatus,
      siteName: siteFilter.trim() || undefined,
      month: monthFilter?.month() != null ? monthFilter.month() + 1 : undefined,
      year: monthFilter?.year(),
    }),
    [params.page, params.limit, apiStatus, siteFilter, monthFilter],
  );

  const listQuery = useSiteAssignments(listParams);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusList && statusList.length > 1 && !statusList.includes(row.status)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const employee = formatUserName(row.employee).toLowerCase();
      const site = row.siteName.toLowerCase();
      const request = row.requestNumber.toLowerCase();
      const project =
        formatSiteAssignmentProject(row)?.toLowerCase() ?? '';
      return (
        employee.includes(query) ||
        site.includes(query) ||
        request.includes(query) ||
        project.includes(query)
      );
    });
  }, [rows, search, statusList]);

  const statusCounts = useMemo(() => {
    // Approximate from current page when server-filtered; prefer full counts when mode is all.
    const source = rows;
    return {
      all: meta?.total ?? source.length,
      pending: source.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      approved: source.filter((row) => APPROVED_STATUSES.includes(row.status))
        .length,
      rejected: source.filter((row) => REJECTED_STATUSES.includes(row.status))
        .length,
    };
  }, [rows, meta?.total]);

  const hasFilters =
    Boolean(search.trim()) ||
    Boolean(siteFilter.trim()) ||
    statusMode !== 'all' ||
    monthFilter != null;

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  function handleResetFilters(): void {
    setStatusMode('all');
    setSiteFilter('');
    setSearch('');
    setMonthFilter(null);
    resetPage();
  }

  const columns: ColumnsType<SiteAssignmentListItem> = useMemo(
    () => [
      {
        title: t('pages.hr.siteAssignments.columns.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.employee'),
        key: 'employee',
        render: (_: unknown, row) => (
          <div className="erp-sa-person">
            <EvaluationListAvatar
              firstName={row.employee.firstName}
              lastName={row.employee.lastName}
              userId={row.employee.id}
            />
            <div className="min-w-0">
              <p className="erp-users-name m-0 truncate">
                {formatUserName(row.employee)}
              </p>
            </div>
          </div>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.site'),
        dataIndex: 'siteName',
        key: 'siteName',
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.project'),
        key: 'project',
        responsive: ['md'],
        render: (_: unknown, row) => (
          <span className="erp-users-cell-sub">
            {formatSiteAssignmentProject(row) ?? '-'}
          </span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.start'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.end'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.days'),
        dataIndex: 'calendarDays',
        key: 'calendarDays',
        align: 'right',
        width: 80,
        render: (value: number) => (
          <span className="erp-users-cell-strong tabular-nums">{value}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: SiteAssignmentStatus) => (
          <StatusBadge
            variant={siteAssignmentStatusVariant(value)}
            label={t(`pages.hr.siteAssignments.status.${value}`)}
          />
        ),
      },
    ],
    [t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-site-assignments-v2">
        <div className="erp-sa-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-site-assignments-v2">
      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-0"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('pages.hr.siteAssignments.loadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label={t('pages.hr.siteAssignments.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<EnvironmentOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <EvaluationStat
          label={t('pages.hr.siteAssignments.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <EvaluationStat
          label={t('pages.hr.siteAssignments.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <EvaluationStat
          label={t('pages.hr.siteAssignments.stats.rejected')}
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
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.hr.siteAssignments.title')}
            </h3>
            <span className="erp-users-count-pill">
              {(meta?.total ?? filteredRows.length).toLocaleString()}
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
              primary={{
                label: t('pages.hr.siteAssignments.newRequest'),
                icon: <PlusOutlined />,
                onClick: () => router.push('/approvals/new/site-assignment'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.siteAssignments.filters.search')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            onClear={() => setSearch('')}
          />
          <Input
            allowClear
            prefix={<EnvironmentOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.siteAssignments.filters.site')}
            className="erp-users-filter-select"
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value);
              resetPage();
            }}
            onClear={() => {
              setSiteFilter('');
              resetPage();
            }}
          />
          <DatePicker
            picker="month"
            placeholder={t('pages.hr.siteAssignments.filters.month')}
            className="erp-sa-month-picker"
            value={monthFilter}
            onChange={(value) => {
              setMonthFilter(value);
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
          <DataTable<SiteAssignmentListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={filteredRows}
            loading={listQuery.isFetching && filteredRows.length === 0}
            scroll={{ x: isNarrow ? 640 : isCompact ? 860 : 1100 }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/site-assignments/${row.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<MapPin />}
                  title={
                    hasFilters
                      ? t('pages.hr.siteAssignments.emptyFiltered')
                      : t('pages.hr.siteAssignments.empty')
                  }
                  description={t('pages.hr.siteAssignments.description')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('pages.hr.siteAssignments.newRequest'),
                          onClick: () =>
                            router.push('/approvals/new/site-assignment'),
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
