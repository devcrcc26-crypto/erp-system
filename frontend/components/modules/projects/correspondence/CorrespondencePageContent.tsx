// UI polish pass - styles only, no logic changes

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
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Mail } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Correspondence,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@/lib/api/project-management.types';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCorrespondence,
  useCreateCorrespondence,
} from '@/lib/query/correspondence';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  correspondenceStatusVariant,
  formatCorrespondenceStatus,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import CorrespondenceDetailDrawer from '@/components/modules/projects/correspondence/CorrespondenceDetailDrawer';

const TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'LETTER', label: 'Letter' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'INSTRUCTION', label: 'Instruction' },
  { value: 'MEMO', label: 'Memo' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'CLOSED', label: 'Closed' },
];

interface CorrespondenceFormValues {
  correspondenceType: CorrespondenceType;
  subject: string;
  senderName: string;
  recipientName: string;
  correspondenceDate: Dayjs;
  referenceNumber?: string;
}

function CorrespondenceFormDrawer({
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
  const [form] = Form.useForm<CorrespondenceFormValues>();
  const createItem = useCreateCorrespondence();
  const messageApi = useAppMessage();

  async function handleSubmit(values: CorrespondenceFormValues): Promise<void> {
    try {
      await createItem.mutateAsync({
        projectId,
        body: {
          correspondenceType: values.correspondenceType,
          subject: values.subject.trim(),
          senderName: values.senderName.trim(),
          recipientName: values.recipientName.trim(),
          correspondenceDate: values.correspondenceDate.format('YYYY-MM-DD'),
          referenceNumber: values.referenceNumber?.trim() || undefined,
        },
      });
      messageApi.success('Correspondence created');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create correspondence', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="New correspondence"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<CorrespondenceFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{
          correspondenceDate: dayjs(),
          correspondenceType: 'LETTER',
        }}
        onFinish={(values: CorrespondenceFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Type"
          name="correspondenceType"
          rules={[{ required: true }]}
        >
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Reference (optional)" name="referenceNumber">
          <Input placeholder="Auto-generated if left blank" />
        </Form.Item>
        <Form.Item
          label="Subject"
          name="subject"
          rules={[{ required: true, message: 'Subject is required' }]}
        >
          <Input />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Sender"
            name="senderName"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Recipient"
            name="recipientName"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
        </div>
        <Form.Item
          label="Date"
          name="correspondenceDate"
          rules={[{ required: true }]}
        >
          <DatePicker className="w-full" />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createItem.isPending}
          >
            Create
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function CorrespondencePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CorrespondenceStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useCorrespondence(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const columns: ColumnsType<Correspondence> = useMemo(
    () => [
      {
        title: 'Reference',
        dataIndex: 'referenceNumber',
        key: 'referenceNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedId(record.id)}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Type',
        dataIndex: 'correspondenceType',
        key: 'correspondenceType',
        render: (value: string) => value.replace(/_/g, ' '),
      },
      {
        title: 'Subject',
        dataIndex: 'subject',
        key: 'subject',
        ellipsis: true,
      },
      { title: 'Sender', dataIndex: 'senderName', key: 'senderName' },
      { title: 'Recipient', dataIndex: 'recipientName', key: 'recipientName' },
      {
        title: 'Date',
        dataIndex: 'correspondenceDate',
        key: 'correspondenceDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: CorrespondenceStatus) => (
          <StatusBadge
            label={formatCorrespondenceStatus(status)}
            variant={correspondenceStatusVariant(status)}
          />
        ),
      },
    ],
    [],
  );

  if (query.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <>
      <FormLayout
        title="Correspondence"
        description="Formal letters, notices, instructions, and project communication."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New correspondence
          </Button>
        }
      >
        {query.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load correspondence"
            description={
              query.error instanceof ApiRequestError
                ? query.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search correspondence"
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
            onChange={(value: CorrespondenceStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
        </Space>

        <DataTable<Correspondence>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Mail />}
                title="No correspondence"
                description="Log formal project letters, notices, and instructions"
                action={{
                  label: 'New correspondence',
                  onClick: () => setCreateOpen(true),
                }}
              />
            ),
          }}
        />
      </FormLayout>

      <CorrespondenceFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void query.refetch()}
      />

      <CorrespondenceDetailDrawer
        projectId={projectId}
        correspondenceId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void query.refetch()}
      />
    </>
  );
}
