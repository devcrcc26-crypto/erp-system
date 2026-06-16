'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Pagination,
  Select,
  Space,
  Spin,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateRfiRequest,
  Rfi,
  RfiPriority,
  RfiStatus,
} from '@/lib/api/project-management.types';
import { RFI_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useCreateRfi,
  useRfis,
  useUpdateRfi,
} from '@/lib/query/rfis';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRfiStatus,
  isOverdue,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import RfiDetailDrawer from '@/components/modules/projects/rfis/RfiDetailDrawer';

const PAGE_SIZE = 20;

const PRIORITY_OPTIONS: Array<{ value: RfiPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

interface RfiFormValues {
  title: string;
  description?: string;
  discipline?: string;
  priority: RfiPriority;
  assignedTo?: string;
  dueDate?: Dayjs;
}

function RfiFormDrawer({
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
  const [form] = Form.useForm<RfiFormValues>();
  const createRfi = useCreateRfi();

  async function handleSubmit(values: RfiFormValues): Promise<void> {
    const body: CreateRfiRequest = {
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      discipline: values.discipline?.trim() || undefined,
      priority: values.priority,
      assignedTo: values.assignedTo,
      dueDate: values.dueDate?.toISOString(),
    };
    await createRfi.mutateAsync({ projectId, body });
    form.resetFields();
    onSaved();
    onClose();
  }

  return (
    <Drawer
      open={open}
      title="Raise RFI"
      onClose={onClose}
      size="large"
      destroyOnHidden
    >
      <Form<RfiFormValues>
        form={form}
        layout="vertical"
        initialValues={{ priority: 'MEDIUM' }}
        onFinish={(values: RfiFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="RFI subject" />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={4} placeholder="Detailed question or clarification" />
        </Form.Item>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Discipline" name="discipline">
            <Input placeholder="e.g. Structural" />
          </Form.Item>
          <Form.Item
            label="Priority"
            name="priority"
            rules={[{ required: true, message: 'Priority is required' }]}
          >
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>
        </div>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Assigned to" name="assignedTo">
            <UserSelect placeholder="Select reviewer" />
          </Form.Item>
          <Form.Item label="Due date" name="dueDate">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={createRfi.isPending}>
            Create RFI
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function RfisPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const rfisQuery = useRfis(projectId, {
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    status: statusFilter,
    priority: priorityFilter,
  });

  const columns: ColumnsType<Rfi> = useMemo(
    () => [
      {
        title: 'RFI #',
        dataIndex: 'rfiNumber',
        key: 'rfiNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedRfiId(record.id)}
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
        title: 'Discipline',
        dataIndex: 'discipline',
        key: 'discipline',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: 'Priority',
        dataIndex: 'priority',
        key: 'priority',
        render: (priority: RfiPriority) => (
          <StatusBadge label={priority} variant={rfiPriorityVariant(priority)} />
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: RfiStatus) => (
          <StatusBadge
            label={formatRfiStatus(status)}
            variant={rfiStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Assigned to',
        dataIndex: 'assignedTo',
        key: 'assignedTo',
        render: (userId: string | null) =>
          userId ? resolveUserName(userId) : '—',
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span className={isOverdue(value) && record.status !== 'CLOSED' ? 'font-medium text-red-600' : undefined}>
            {formatProjectDate(value)}
          </span>
        ),
      },
    ],
    [resolveUserName],
  );

  if (rfisQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const apiUnavailable =
    rfisQuery.isError &&
    rfisQuery.error instanceof ApiRequestError &&
    (rfisQuery.error.status === 404 || rfisQuery.error.status === 0);

  const rfis = rfisQuery.data?.data ?? [];
  const meta = rfisQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="RFIs"
        description="Requests for information — track clarifications from design to closeout."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            disabled={apiUnavailable}
          >
            Raise RFI
          </Button>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            message="RFI APIs are not connected yet."
            description="This page is ready — data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search RFIs"
            style={{ width: 220 }}
            onSearch={(value: string) => {
              setPage(1);
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(value: RfiStatus | undefined) => {
              setPage(1);
              setStatusFilter(value);
            }}
            options={RFI_WORKFLOW.map((step) => ({
              value: step.key,
              label: step.label,
            }))}
          />
          <Select
            allowClear
            placeholder="Priority"
            style={{ width: 140 }}
            value={priorityFilter}
            onChange={(value: RfiPriority | undefined) => {
              setPage(1);
              setPriorityFilter(value);
            }}
            options={PRIORITY_OPTIONS}
          />
        </Space>

        <DataTable<Rfi>
          rowKey="id"
          columns={columns}
          dataSource={rfis}
          locale={{ emptyText: 'No RFIs found' }}
        />

        {meta && meta.pages > 1 && (
          <div className="mt-4 flex justify-end">
            <Pagination
              current={meta.page}
              pageSize={meta.limit}
              total={meta.total}
              showSizeChanger={false}
              onChange={(nextPage: number) => setPage(nextPage)}
            />
          </div>
        )}
      </FormLayout>

      <RfiFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void rfisQuery.refetch()}
      />

      <RfiDetailDrawer
        projectId={projectId}
        rfiId={selectedRfiId}
        onClose={() => setSelectedRfiId(null)}
        onUpdated={() => void rfisQuery.refetch()}
      />
    </>
  );
}
