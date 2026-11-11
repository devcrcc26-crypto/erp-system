'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { SiteAssignmentListItem } from '@/lib/api/site-assignment.types';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { useCurrentUser } from '@/lib/query/profile';
import { formatProjectDate } from '@/lib/utils/project-display';
import { siteAssignmentStatusVariant } from '@/lib/utils/site-assignment-display';

const HISTORY_PAGE_SIZE = 10;

export default function EmployeeSiteAssignmentsSection({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const query = useEmployeeSiteAssignments(employeeId);
  const [historyPage, setHistoryPage] = useState(1);

  const currentUserId = currentUser.data?.id;
  const canShowNewRequest =
    Boolean(currentUserId) && currentUserId !== employeeId;

  const allRows = useMemo(() => {
    const rows = query.data ?? [];
    return [...rows].sort((a, b) => {
      const aTime = new Date(a.submittedAt ?? a.startDate).getTime();
      const bTime = new Date(b.submittedAt ?? b.startDate).getTime();
      return bTime - aTime;
    });
  }, [query.data]);

  const historyMeta = useMemo(() => {
    const total = allRows.length;
    const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE) || 1);
    const page = Math.min(historyPage, pages);
    return { total, page, limit: HISTORY_PAGE_SIZE, pages };
  }, [allRows.length, historyPage]);

  const historyRows = useMemo(() => {
    const start = (historyMeta.page - 1) * historyMeta.limit;
    return allRows.slice(start, start + historyMeta.limit);
  }, [allRows, historyMeta.page, historyMeta.limit]);

  const columns: ColumnsType<SiteAssignmentListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 140,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.site'),
        dataIndex: 'siteName',
        key: 'siteName',
        ellipsis: true,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.columns.days'),
        dataIndex: 'calendarDays',
        key: 'calendarDays',
        width: 72,
        align: 'right',
        render: (value: number) => (
          <span className="erp-users-cell-strong tabular-nums">{value}</span>
        ),
      },
      {
        title: t('common.status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: SiteAssignmentListItem['status']) => (
          <StatusBadge
            variant={siteAssignmentStatusVariant(status)}
            label={t(`pages.hr.siteAssignments.status.${status}`)}
          />
        ),
      },
    ],
    [t],
  );

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('pages.hr.siteAssignments.loadFailed');
  }

  return (
    <div className="erp-employee-section mt-5">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">
          {t('pages.hr.siteAssignments.profileSectionTitle')}
        </h3>
        {canShowNewRequest ? (
          <Button
            type="link"
            size="small"
            className="!px-0"
            onClick={() => router.push('/approvals/new/site-assignment')}
          >
            {t('pages.hr.siteAssignments.newRequest')}
          </Button>
        ) : null}
      </div>
      <div className="erp-employee-section-body erp-employee-section-body--flush">
        {query.isError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={errorMessage(query.error)} />
          </div>
        ) : query.isLoading && !query.data ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <DataTable<SiteAssignmentListItem>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table erp-leave-history-table"
            loading={query.isLoading}
            columns={columns}
            dataSource={historyRows}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/site-assignments/${record.id}`),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: historyMeta.page,
              pageSize: historyMeta.limit,
              total: historyMeta.total,
              showSizeChanger: false,
              onChange: (page) => setHistoryPage(page),
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<MapPin size={28} strokeWidth={1.5} />}
                  title={t('pages.hr.siteAssignments.empty')}
                />
              ),
            }}
          />
        )}
      </div>
    </div>
  );
}
