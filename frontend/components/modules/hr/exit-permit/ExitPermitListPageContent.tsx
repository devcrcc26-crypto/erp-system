'use client';

import { useTablePagination } from "@/hooks/use-table-pagination";
import { ExitPermitListItem, ExitPermitStatus } from "@/lib/api/exit-permit.types";
import { useExitPermits } from "@/lib/query/exit-permit";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { ApiRequestError } from "@/lib/api/errors";
import { Alert, Select, DatePicker, Button, Tooltip, Tag } from "antd";
import { StatCard } from "../../dashboard/DashboardStats";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, InboxOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { ListSearchInput, StatusBadge, TableEmptyState } from "@/components/ui";
import { useUsersDirectory } from "@/lib/query/users";
import TableUpdatingIndicator from "@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator";
import ListPageNavIcon from "@/components/ui/ListPageNavIcon/ListPageNavIcon";
import { tokens } from "@/lib/theme/tokens";
import { useRouter } from "next/navigation";
import { ColumnsType } from "antd/es/table";
import { exitPermitStatusVariant, formatExitPermitDepartmentName, formatExitPermitEmployeeName, formatExitPermitStatus } from "@/lib/utils/exit-permit-display";
import DataTable from "@/components/ui/DataTable/DataTable";
import { useDepartments } from "@/lib/query/org";


const { RangePicker } = DatePicker;

export default function ExitPermitListPageContent(): React.ReactNode {

  const {t} = useEpcTranslation();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExitPermitStatus[]>([]);
  const canViewHr = useCanViewHr();
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const { params, resetPage, bindMeta } = useTablePagination();

  const listParams = useMemo(() => ({
    ...params,
    search: search.trim() || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    employeeId: canViewHr ? employeeId : undefined,
    dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
  }), [
    params,
    search,
    statusFilter,
    employeeId,
    dateRange,
    canViewHr,
  ]);


  
  const columns: ColumnsType<ExitPermitListItem> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        dataIndex: 'employee',
        key: 'employee',
        render: (_: unknown, row: ExitPermitListItem) => (
          <span>
            {formatExitPermitEmployeeName(row.employee)}
            {row.isOnBehalf ? (
              <Tag className="ml-2" color="blue">
                {t('hr.table.onBehalf')}
              </Tag>
            ) : null}
          </span>
        ),
      },
      {
        title: t('hr.table.submittedBy'),
        dataIndex: 'submitter',
        key: 'submitter',
        render: (_: unknown, row: ExitPermitListItem) =>
          formatExitPermitEmployeeName(row.submitter ?? row.creator),
      },
      {
        title: t('hr.table.direction'),
        dataIndex: 'direction',
        key: 'direction',
        width: 100  ,
        render: (value: 'IN' | 'OUT') => (
          <Tag color={value === 'IN' ? 'green' : 'red'}>
            {value === 'IN' ? 'In' : 'Out'}
          </Tag>
        ),
      },
      {
        title: t('hr.table.date'),
        dataIndex: 'date',
        key: 'date',
        render: (text: string) => dayjs(text).format('DD/MM/YYYY'),
      },
      {
        title: t('hr.table.department'),
        dataIndex: 'department',
        key: 'department',
        render: (_: unknown, row: ExitPermitListItem) => formatExitPermitDepartmentName(row.department),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        render: (value: ExitPermitStatus) => (
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
        render: (value: string | null | undefined) => value ?? '-',
      },
    ],
    [canViewHr, t],
  );

  const listQuery = useExitPermits(listParams, true);

  const statusCounts = {
    all: listQuery.data?.meta?.total ?? 0,
    pending: listQuery.data?.meta?.total ?? 0,
    approved: listQuery.data?.meta?.total ?? 0,
    rejected: listQuery.data?.meta?.total ?? 0,
  }


  const statusOptions = useMemo(() => [
    { value: 'DRAFT', label: t('hr.status.DRAFT') },
    { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
    { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
    { value: 'APPROVED', label: t('hr.status.APPROVED') },
    { value: 'REJECTED', label: t('hr.status.REJECTED') },
    { value: 'RETURNED', label: t('hr.status.RETURNED') },
  ], [t]);

  const meta = listQuery.data?.meta;
  const rows = listQuery.data?.data ?? [];
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    employeeId !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  const router = useRouter();

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError ? listQuery.error.message : 'Failed to load exit permits'
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          color="teal"
          icon={<InboxOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.pending')}
          value={statusCounts.pending}
          color="blue"
          icon={<ClockCircleOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.approved')}
          value={statusCounts.approved}
          color="green"
          icon={<CheckCircleOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.rejected')}
          value={statusCounts.rejected}
          color="red"
          icon={<CloseCircleOutlined size={14} />}
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
            placeholder={t('hr.placeholder.searchExitPermit')}
            className="w-full min-w-0 sm:w-72"
          />

          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              resetPage();
            }}
            maxTagCount="responsive"
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
          />

          {canViewHr ? (
            <Select
              showSearch
              allowClear
              placeholder={t('hr.placeholder.employee')}
              loading={usersQuery.isLoading}
              value={employeeId}
              onChange={(v) => {
                setEmployeeId(v);
                resetPage();
              }}
              className="w-full min-w-0 sm:w-56"
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
                }
                options={
                  usersQuery.data?.data?.map((u) => ({
                    value: u.id,
                    label: `${u.firstName} ${u.lastName}`,
                  })) ?? []
                }
              />
            ) : null}

            <RangePicker
              value={dateRange}
              className="w-full min-w-0 sm:min-w-[260px] sm:w-auto"
              onChange={(v) => {
                setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
                resetPage();
              }}
              placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
            />

         <div className="ml-auto flex items-center gap-2">
           <Button 
            onClick={() => {
              setSearch('');
              setStatusFilter([]);
              setEmployeeId(undefined);
              setDateRange(null);
              resetPage();
            }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              style={{ borderRadius: 0 }}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
         </div>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}
      
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ListPageNavIcon iconKey="hr-equipment-and-materials-exit-permit" />
            <h3 className="m-0 text-sm font-semibold" style={{ color: tokens.colorTextPrimary }}>Exit Permits</h3>
            <span className="text-xs" style={{ color: tokens.colorTextTertiary }}>
              {meta?.total ?? rows.length}
            </span>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/exit-permit')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.newExitPermit')}
          </Button>
        </div>
        <div>
          <DataTable<ExitPermitListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            loading={listQuery.isFetching && !listQuery.isLoading}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
            onRow={(row) => ({
              onClick: () => router.push(`/hr/exit-permit/${row.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  title={t('hr.empty.exitPermit')}
                  description={t('hr.empty.exitPermitDescription')}
                  icon={<InboxOutlined />}
                  action={
                    hasFilters ? {
                      label: t('common.reset'),
                      onClick: () => {
                        setSearch('');
                        setStatusFilter([]);
                        setEmployeeId(undefined);
                        setDateRange(null);
                        resetPage();
                      },
                    } : {
                      label: t('hr.buttons.newExitPermit'),
                      onClick: () => router.push('/approvals/new/exit-permit'),
                    }
                  }
                />
              ),
            }}
          />
        </div>
      </div>
      
    </div>
  )
}