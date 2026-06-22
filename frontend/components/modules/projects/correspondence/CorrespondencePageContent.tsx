'use client';

import { Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useCorrespondence } from '@/lib/query/correspondence';
import type { Correspondence } from '@/lib/api/project-management.types';
import { formatProjectDate } from '@/lib/utils/project-display';
import { ApiRequestError } from '@/lib/api/errors';

export default function CorrespondencePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, bindMeta } = useTablePagination();
  const query = useCorrespondence(projectId, params);
  const rows = query.data?.data ?? [];

  const columns: ColumnsType<Correspondence> = [
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'referenceNumber' },
    { title: 'Type', dataIndex: 'correspondenceType', key: 'correspondenceType' },
    { title: 'Subject', dataIndex: 'subject', key: 'subject' },
    { title: 'Sender', dataIndex: 'senderName', key: 'senderName' },
    { title: 'Recipient', dataIndex: 'recipientName', key: 'recipientName' },
    {
      title: 'Date',
      dataIndex: 'correspondenceDate',
      key: 'correspondenceDate',
      render: (value: string) => formatProjectDate(value),
    },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  const apiUnavailable =
    query.isError &&
    query.error instanceof ApiRequestError &&
    (query.error.status === 404 || query.error.status === 0);

  return (
    <FormLayout
      title="Correspondence"
      description="Formal letters, notices, instructions, and project communication."
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Correspondence APIs are not connected yet."
        />
      )}
      <DataTable<Correspondence>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={bindMeta(query.data?.meta)}
        locale={{ emptyText: 'No correspondence found' }}
      />
    </FormLayout>
  );
}
