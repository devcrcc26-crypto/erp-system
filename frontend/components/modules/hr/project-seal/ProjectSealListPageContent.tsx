'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Select,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListPageNavIcon from '@/components/ui/ListPageNavIcon/ListPageNavIcon';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ProjectSealListItem,
  ProjectSealStatus,
} from '@/lib/api/project-seal.types';
import { useProjectSeals } from '@/lib/query/project-seal';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import {
  formatProjectSealEmployeeName,
  formatProjectSealStatus,
  formatProjectSealUrgency,
  projectSealStatusVariant,
} from '@/lib/utils/project-seal';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const PENDING_STATUSES: ProjectSealStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];

/**
 * Company or personal project seal usage list with filters and stats.
 */
export default function ProjectSealListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectSealStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const statusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: t('hr.status.DRAFT') },
      { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
      { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
      { value: 'APPROVED', label: t('hr.status.APPROVED') },
      { value: 'REJECTED', label: t('hr.status.REJECTED') },
      { value: 'RETURNED', label: t('hr.status.RETURNED') },
      { value: 'CANCELLED', label: t('hr.status.CANCELLED') },
      { value: 'SEAL_ISSUED', label: t('hr.status.SEAL_ISSUED') },
    ],
    [t],
  );

  const pageTitle = canViewHr
    ? t('pages.hr.projectSeal.listTitle')
    : t('pages.hr.projectSeal.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.projectSeal.listDescription')
    : t('pages.hr.projectSeal.myListDescription');

  const countsBaseParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      employeeId: canViewHr ? employeeId : undefined,
    }),
    [search, canViewHr, employeeId],
  );

  const listParams = useMemo(
    () => ({
      ...params,
      ...countsBaseParams,
      status: statusFilter.length > 0 ? statusFilter : undefined,
    }),
    [params, countsBaseParams, statusFilter],
  );

  const listQuery = useProjectSeals(listParams, true);
  const totalCountQuery = useProjectSeals(
    { page: 1, limit: 1, ...countsBaseParams },
    true,
  );
  const pendingCountQuery = useProjectSeals(
    { page: 1, limit: 1, status: PENDING_STATUSES, ...countsBaseParams },
    true,
  );
  const approvedCountQuery = useProjectSeals(
    {
      page: 1,
      limit: 1,
      status: ['APPROVED', 'SEAL_ISSUED'],
      ...countsBaseParams,
    },
    true,
  );
  const rejectedCountQuery = useProjectSeals(
    { page: 1, limit: 1, status: ['REJECTED'], ...countsBaseParams },
    true,
  );
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? rows.length;

  const statusCounts = {
    all: totalCountQuery.data?.meta?.total ?? totalCount,
    pending: pendingCountQuery.data?.meta?.total ?? 0,
    approved: approvedCountQuery.data?.meta?.total ?? 0,
    rejected: rejectedCountQuery.data?.meta?.total ?? 0,
  };

  const columns: ColumnsType<ProjectSealListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 120,
        render: (value: string) => (
          <span
            className="font-[family-name:var(--font-mono)] text-xs font-medium"
            style={{ color: tokens.colorPrimary }}
          >
            {value}
          </span>
        ),
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: ProjectSealListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatProjectSealEmployeeName(row.employee) || '—'}
                  </p>
                  {row.employee?.email ? (
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
            } satisfies ColumnsType<ProjectSealListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.fileName'),
        dataIndex: 'fileName',
        key: 'fileName',
        ellipsis: true,
        render: (value: string) => (
          <span className="text-sm" style={{ color: tokens.colorTextPrimary }}>
            {value}
          </span>
        ),
      },
      {
        title: t('hr.table.urgency'),
        dataIndex: 'urgency',
        key: 'urgency',
        width: 110,
        responsive: ['md'],
        render: (value: string) => formatProjectSealUrgency(value, t),
      },
      {
        title: t('hr.table.dateNeeded'),
        dataIndex: 'dateNeeded',
        key: 'dateNeeded',
        width: 120,
        responsive: ['lg'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: ProjectSealStatus) => (
          <StatusBadge
            label={formatProjectSealStatus(value, t)}
            variant={projectSealStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        responsive: ['lg'],
        render: (_: string | null | undefined, row: ProjectSealListItem) =>
          row.directApproved
            ? t('hr.labels.directApproval')
            : (row.currentTierLabel ?? '—'),
      },
    ],
    [canViewHr, t],
  );

  function handleResetFilters(): void {
    setSearch('');
    setStatusFilter([]);
    setEmployeeId(undefined);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    employeeId !== undefined;

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadProjectSeals')
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          color="teal"
          icon={<SafetyCertificateOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.pending')}
          value={statusCounts.pending}
          color="amber"
          icon={<ClockCircleOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.approved')}
          value={statusCounts.approved}
          color="blue"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.rejected')}
          value={statusCounts.rejected}
          color="red"
          icon={<CloseCircleOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.placeholder.searchProjectSeal')}
            className="w-full min-w-0 sm:w-72"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            options={statusOptions}
            value={statusFilter}
            onChange={(value: ProjectSealStatus[]) => {
              setStatusFilter(value);
              resetPage();
            }}
            maxTagCount="responsive"
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
          />
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              loading={usersQuery.isLoading}
              className="w-full min-w-0 sm:w-48"
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

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ListPageNavIcon iconKey="hr-project-seal" />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {pageTitle}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {totalCount}{' '}
              {totalCount === 1
                ? t('pages.hr.projectSeal.requestSingular')
                : t('pages.hr.projectSeal.requestPlural')}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/approvals/new/project-seal')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.newProjectSeal')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<ProjectSealListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/project-seal/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={
                    <SafetyCertificateOutlined style={{ fontSize: 24 }} />
                  }
                  title={t('hr.empty.noProjectSeals')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newProjectSeal'),
                          onClick: () =>
                            router.push('/approvals/new/project-seal'),
                        }
                  }
                />
              ),
            }}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
