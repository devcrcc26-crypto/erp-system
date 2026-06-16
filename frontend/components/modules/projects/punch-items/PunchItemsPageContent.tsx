'use client';

import { Alert, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { usePunchItems } from '@/lib/query/punch-items';
import type { PunchItem } from '@/lib/api/project-management.types';
import { formatProjectDate } from '@/lib/utils/project-display';
import { ApiRequestError } from '@/lib/api/errors';

export default function PunchItemsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const query = usePunchItems(projectId, { page: 1, limit: 50 });
  const rows = query.data?.data ?? [];

  const columns: ColumnsType<PunchItem> = [
    { title: 'Punch #', dataIndex: 'punchNumber', key: 'punchNumber' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Area', dataIndex: 'roomOrArea', key: 'roomOrArea' },
    { title: 'Trade', dataIndex: 'tradeResponsible', key: 'tradeResponsible' },
    { title: 'Severity', dataIndex: 'severity', key: 'severity' },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (value: string | null) => formatProjectDate(value),
    },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  const apiUnavailable =
    query.isError &&
    query.error instanceof ApiRequestError &&
    (query.error.status === 404 || query.error.status === 0);

  return (
    <FormLayout
      title="Punch list"
      description="Final walkthrough defects, corrections, and verification tracking."
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Punch list APIs are not connected yet."
        />
      )}
      <Table<PunchItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'No punch items found' }}
      />
    </FormLayout>
  );
}
