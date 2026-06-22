'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { Meeting, MeetingStatus, MeetingType } from '@/lib/api/project-management.types';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCreateMeeting, useMeetings } from '@/lib/query/meetings';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import MeetingDetailDrawer from '@/components/modules/projects/meetings/MeetingDetailDrawer';

const MEETING_TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: 'PROGRESS', label: 'Progress' },
  { value: 'DESIGN_COORDINATION', label: 'Design coordination' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'CLIENT', label: 'Client' },
];

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CONDUCTED', label: 'Conducted' },
  { value: 'MINUTES_ISSUED', label: 'Minutes issued' },
  { value: 'CLOSED', label: 'Closed' },
];

interface MeetingFormValues {
  meetingType: MeetingType;
  title: string;
  meetingDate: Dayjs;
  location?: string;
}

function MeetingFormDrawer({
  open,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<MeetingFormValues>();
  const createMeeting = useCreateMeeting();
  const messageApi = useAppMessage();

  async function handleSubmit(values: MeetingFormValues): Promise<void> {
    try {
      await createMeeting.mutateAsync({
        projectId,
        body: {
          meetingType: values.meetingType,
          title: values.title.trim(),
          meetingDate: values.meetingDate.format('YYYY-MM-DD'),
          location: values.location?.trim() || undefined,
        },
      });
      messageApi.success('Meeting created');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create meeting', messageApi);
    }
  }

  return (
    <Drawer
      open={open}
      title="New meeting"
      onClose={onClose}
      size="large"
      destroyOnHidden
    >
      <Form<MeetingFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ meetingDate: dayjs(), meetingType: 'PROGRESS' }}
        onFinish={(values: MeetingFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Meeting type"
          name="meetingType"
          rules={[{ required: true }]}
        >
          <Select options={MEETING_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Weekly progress meeting" />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Date"
            name="meetingDate"
            rules={[{ required: true }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item label="Location" name="location">
            <Input placeholder="Site office, room 2" />
          </Form.Item>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMeeting.isPending}
          >
            Create meeting
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function MeetingsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const meetingsQuery = useMeetings(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const columns: ColumnsType<Meeting> = useMemo(
    () => [
      {
        title: 'Meeting #',
        dataIndex: 'meetingNumber',
        key: 'meetingNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedMeetingId(record.id)}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Title',
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: 'Type',
        dataIndex: 'meetingType',
        key: 'meetingType',
        render: (value: string) => value.replace(/_/g, ' '),
      },
      {
        title: 'Date',
        dataIndex: 'meetingDate',
        key: 'meetingDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Organizer',
        dataIndex: 'organizerId',
        key: 'organizerId',
        render: (userId: string) => resolveUserName(userId),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: MeetingStatus) => (
          <StatusBadge
            label={formatMeetingStatus(status)}
            variant={meetingStatusVariant(status)}
          />
        ),
      },
    ],
    [resolveUserName],
  );

  if (meetingsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const meetings = meetingsQuery.data?.data ?? [];
  const meta = meetingsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Meetings"
        description="Project meetings, attendees, agenda, and action items."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New meeting
          </Button>
        }
      >
        {meetingsQuery.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load meetings"
            description={
              meetingsQuery.error instanceof ApiRequestError
                ? meetingsQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search meetings"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControl}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value: MeetingStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
        </Space>

        <DataTable<Meeting>
          rowKey="id"
          columns={columns}
          dataSource={meetings}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Users />}
                title="No meetings"
                description="Schedule project meetings to track agenda, attendees, and actions"
                action={{ label: 'New meeting', onClick: () => setCreateOpen(true) }}
              />
            ),
          }}
        />
      </FormLayout>

      <MeetingFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void meetingsQuery.refetch()}
      />

      <MeetingDetailDrawer
        projectId={projectId}
        meetingId={selectedMeetingId}
        onClose={() => setSelectedMeetingId(null)}
        onUpdated={() => void meetingsQuery.refetch()}
      />
    </>
  );
}
