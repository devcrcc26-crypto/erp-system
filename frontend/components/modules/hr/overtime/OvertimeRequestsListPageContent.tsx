'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
import { ClockCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import OvertimeRequestFormDrawer from '@/components/modules/hr/overtime/OvertimeRequestFormDrawer';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, {
  PageLoadingSkeleton,
} from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import {
  useCanAccessOvertime,
  useCanCreateOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  OvertimeRequestListItem,
  OvertimeStatus,
} from '@/lib/api/overtime.types';
import {
  useMyOvertimeRequests,
  useOvertimeRequests,
} from '@/lib/query/overtime';
import { useProjects } from '@/lib/query/projects';
import { useUsersDirectory } from '@/lib/query/users';
import {
  OVERTIME_STATUS_OPTIONS,
  formatOvertimeCompensation,
  formatOvertimeEmployeeName,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Company or personal overtime request list with filters.
 */
export default function OvertimeRequestsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const canAccess = useCanAccessOvertime();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateOvertime();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OvertimeStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      projectId,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [
      params,
      search,
      statusFilter,
      employeeId,
      projectId,
      dateRange,
      canViewHr,
    ],
  );

  const companyListQuery = useOvertimeRequests(listParams, canViewHr);
  const myListQuery = useMyOvertimeRequests(listParams, !canViewHr && canAccess);
  const listQuery = canViewHr ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );
  const projectsQuery = useProjects({ page: 1, limit: 100 }, canAccess);

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<OvertimeRequestListItem> = [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 120,
    },
    ...(canViewHr
      ? [
          {
            title: 'Employee',
            key: 'employee',
            render: (_: unknown, row: OvertimeRequestListItem) =>
              formatOvertimeEmployeeName(row.employee),
          } satisfies ColumnsType<OvertimeRequestListItem>[number],
        ]
      : []),
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: 'Hours',
      dataIndex: 'hours',
      key: 'hours',
      width: 80,
      align: 'right',
    },
    {
      title: 'Project',
      key: 'project',
      render: (_, row) =>
        row.project
          ? `${row.project.projectCode} — ${row.project.name}`
          : '—',
    },
    {
      title: 'Compensation',
      key: 'compensationType',
      width: 150,
      render: (_, row) => formatOvertimeCompensation(row.compensationType),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: OvertimeStatus) => (
        <StatusBadge
          label={formatOvertimeStatus(value)}
          variant={overtimeStatusVariant(value)}
        />
      ),
    },
    {
      title: 'Current tier',
      key: 'currentTier',
      width: 110,
      align: 'right',
      render: (_, row) => row.approvalRequest?.currentTier ?? '—',
    },
  ];

  if (!canAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to overtime requests."
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <FormLayout
      title={
        canViewHr
          ? t('pages.hr.overtime.listTitle')
          : t('pages.hr.overtime.myListTitle')
      }
      description={
        canViewHr
          ? t('pages.hr.overtime.listDescription')
          : t('pages.hr.overtime.myListDescription')
      }
      extra={
        canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New Request
          </Button>
        ) : undefined
      }
    >
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load overtime requests'
          }
        />
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Search request # or reason"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          style={{ minWidth: 180 }}
          options={OVERTIME_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value: OvertimeStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
        />
        {canViewHr ? (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Employee"
            style={{ minWidth: 200 }}
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
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Project"
          style={{ minWidth: 220 }}
          options={(projectsQuery.data?.data ?? []).map((project) => ({
            value: project.id,
            label: `${project.projectCode} — ${project.name}`,
          }))}
          value={projectId}
          onChange={(value: string | undefined) => {
            setProjectId(value);
            resetPage();
          }}
        />
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      <DataTable<OvertimeRequestListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isFetching}
        onRow={(record) => ({
          onClick: () => router.push(`/hr/overtime/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<ClockCircleOutlined />}
              title="No overtime requests"
              description="Create an overtime request to start the approval flow."
            />
          ),
        }}
        pagination={bindMeta(meta)}
      />

      <OvertimeRequestFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmitted={() => void listQuery.refetch()}
      />
    </FormLayout>
  );
}
