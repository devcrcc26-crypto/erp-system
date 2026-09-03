'use client';

import { useTablePagination } from "@/hooks/use-table-pagination";
import { ExitPermitStatus } from "@/lib/api/exit-permit.types";
import { useExitPermits } from "@/lib/query/exit-permit";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { ApiRequestError } from "@/lib/api/errors";
import { Alert } from "antd";
import { StatCard } from "../../dashboard/DashboardStats";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, InboxOutlined } from "@ant-design/icons";


export default function ExitPermitListPageContent(): React.ReactNode {

  const {t} = useEpcTranslation();

  const {params} = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExitPermitStatus[]>([]);
  const canViewHr = useCanViewHr();
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

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

  const listQuery = useExitPermits(listParams, true);

  const statusCounts = {
    all: listQuery.data?.meta?.total ?? 0,
    pending: listQuery.data?.meta?.total ?? 0,
    approved: listQuery.data?.meta?.total ?? 0,
    rejected: listQuery.data?.meta?.total ?? 0,
  }

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
      

    </div>
  )
}