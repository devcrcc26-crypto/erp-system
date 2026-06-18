'use client';

import type { ColumnsType } from 'antd/es/table';
import { Spin } from 'antd';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { DispatcherWorkloadItem } from '@/lib/api/epc.types';
import { useProjectWorkload } from '@/lib/query/epc-workspace';

export default function DispatcherWorkloadTable({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const workloadQuery = useProjectWorkload(projectId);

  const apiUnavailable =
    workloadQuery.isError &&
    workloadQuery.error instanceof ApiRequestError &&
    (workloadQuery.error.status === 404 || workloadQuery.error.status === 0);

  const columns: ColumnsType<DispatcherWorkloadItem> = [
    {
      title: 'Reviewer',
      dataIndex: 'displayName',
      key: 'displayName',
    },
    {
      title: 'Assigned sessions',
      dataIndex: 'assignedReviewSessions',
      key: 'assignedReviewSessions',
      sorter: (a, b) => a.assignedReviewSessions - b.assignedReviewSessions,
    },
    {
      title: 'Open comments',
      dataIndex: 'openComments',
      key: 'openComments',
      sorter: (a, b) => a.openComments - b.openComments,
    },
    {
      title: 'SLA overdue',
      dataIndex: 'slaOverdue',
      key: 'slaOverdue',
      render: (value: number) =>
        value > 0 ? (
          <StatusBadge label={String(value)} variant="error" />
        ) : (
          '0'
        ),
      sorter: (a, b) => a.slaOverdue - b.slaOverdue,
    },
  ];

  if (workloadQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  return (
    <FormLayout
      title="Dispatcher workload"
      description="Review queue bottlenecks by assignee — use to balance reviewer load."
    >
      {apiUnavailable && (
        <p className="mb-4 text-sm text-slate-500">
          Workload API not available yet.
        </p>
      )}

      <DataTable<DispatcherWorkloadItem>
        rowKey="userId"
        columns={columns}
        dataSource={workloadQuery.data ?? []}
        loading={workloadQuery.isLoading}
        locale={{ emptyText: 'No reviewer workload data' }}
      />
    </FormLayout>
  );
}
