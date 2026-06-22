'use client';

import { Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useMeetings } from '@/lib/query/meetings';
import type { Meeting } from '@/lib/api/project-management.types';
import { formatProjectDate } from '@/lib/utils/project-display';
import { ApiRequestError } from '@/lib/api/errors';

export default function MeetingsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, bindMeta } = useTablePagination();
  const meetingsQuery = useMeetings(projectId, params);
  const meetings = meetingsQuery.data?.data ?? [];

  const columns: ColumnsType<Meeting> = [
    { title: 'Meeting #', dataIndex: 'meetingNumber', key: 'meetingNumber' },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Type', dataIndex: 'meetingType', key: 'meetingType' },
    {
      title: 'Date',
      dataIndex: 'meetingDate',
      key: 'meetingDate',
      render: (value: string) => formatProjectDate(value),
    },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  const apiUnavailable =
    meetingsQuery.isError &&
    meetingsQuery.error instanceof ApiRequestError &&
    (meetingsQuery.error.status === 404 || meetingsQuery.error.status === 0);

  return (
    <FormLayout
      title="Meetings"
      description="Project meetings, attendees, agenda, and action items."
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Meeting APIs are not connected yet."
        />
      )}
      <DataTable<Meeting>
        rowKey="id"
        columns={columns}
        dataSource={meetings}
        pagination={bindMeta(meetingsQuery.data?.meta)}
        locale={{ emptyText: 'No meetings found' }}
      />
    </FormLayout>
  );
}
