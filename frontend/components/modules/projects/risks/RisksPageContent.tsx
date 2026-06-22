'use client';

import { Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useRisks } from '@/lib/query/risks';
import type { Risk } from '@/lib/api/project-management.types';
import { formatProjectDate } from '@/lib/utils/project-display';
import { ApiRequestError } from '@/lib/api/errors';

export default function RisksPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, bindMeta } = useTablePagination();
  const query = useRisks(projectId, params);
  const rows = query.data?.data ?? [];

  const columns: ColumnsType<Risk> = [
    { title: 'Risk #', dataIndex: 'riskIdCode', key: 'riskIdCode' },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Probability', dataIndex: 'probability', key: 'probability' },
    { title: 'Impact', dataIndex: 'impact', key: 'impact' },
    { title: 'Score', dataIndex: 'riskScore', key: 'riskScore' },
    {
      title: 'Review date',
      dataIndex: 'reviewDate',
      key: 'reviewDate',
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
      title="Risk register"
      description="Project risks with probability-impact scoring and mitigation plans."
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Risk APIs are not connected yet."
        />
      )}
      <DataTable<Risk>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={bindMeta(query.data?.meta)}
        locale={{ emptyText: 'No risks found' }}
      />
    </FormLayout>
  );
}
