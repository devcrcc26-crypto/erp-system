'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
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
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateSubmittalRequest,
  Submittal,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useCreateSubmittal, useSubmittals } from '@/lib/query/submittals';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  isOverdue,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';

const PAGE_SIZE = 20;

interface SubmittalFormValues {
  category: string;
  title: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  revisionNumber?: number;
  dueDate?: Dayjs;
}

function SubmittalFormDrawer({
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
  const [form] = Form.useForm<SubmittalFormValues>();
  const createSubmittal = useCreateSubmittal();

  async function handleSubmit(values: SubmittalFormValues): Promise<void> {
    const body: CreateSubmittalRequest = {
      category: values.category.trim(),
      title: values.title.trim(),
      contractor: values.contractor?.trim() || undefined,
      supplier: values.supplier?.trim() || undefined,
      specReference: values.specReference?.trim() || undefined,
      revisionNumber: values.revisionNumber,
      dueDate: values.dueDate?.toISOString(),
    };
    await createSubmittal.mutateAsync({ projectId, body });
    form.resetFields();
    onSaved();
    onClose();
  }

  return (
    <Drawer
      open={open}
      title="New submittal"
      onClose={onClose}
      size="large"
      destroyOnHidden
    >
      <Form<SubmittalFormValues>
        form={form}
        layout="vertical"
        initialValues={{ revisionNumber: 1 }}
        onFinish={(values: SubmittalFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Category"
          name="category"
          rules={[{ required: true, message: 'Category is required' }]}
        >
          <Input placeholder="e.g. Shop drawings, Product data" />
        </Form.Item>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Submittal title" />
        </Form.Item>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Contractor" name="contractor">
            <Input />
          </Form.Item>
          <Form.Item label="Supplier" name="supplier">
            <Input />
          </Form.Item>
        </div>
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Spec reference" name="specReference">
            <Input placeholder="e.g. Section 03 30 00" />
          </Form.Item>
          <Form.Item label="Revision" name="revisionNumber">
            <InputNumber className="!w-full" min={1} />
          </Form.Item>
        </div>
        <Form.Item label="Due date" name="dueDate">
          <DatePicker className="w-full" />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createSubmittal.isPending}
          >
            Create submittal
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function SubmittalsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(
    null,
  );

  const submittalsQuery = useSubmittals(projectId, {
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: 'Submittal #',
        dataIndex: 'submittalNumber',
        key: 'submittalNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedSubmittalId(record.id)}
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
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
      },
      {
        title: 'Rev',
        dataIndex: 'revisionNumber',
        key: 'revisionNumber',
        width: 64,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={formatSubmittalStatus(status)}
            variant={submittalStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span
            className={
              isOverdue(value) &&
              record.status !== 'APPROVED' &&
              record.status !== 'REJECTED'
                ? 'font-medium text-red-600'
                : undefined
            }
          >
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: 'Contractor',
        dataIndex: 'contractor',
        key: 'contractor',
        render: (value: string | null) => value ?? '-',
      },
    ],
    [],
  );

  if (submittalsQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Submittals"
        description="Material approvals, shop drawings, and product data submittals."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            disabled={apiUnavailable}
          >
            New submittal
          </Button>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
            description="This page is ready - data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search submittals"
            style={{ width: 220 }}
            onSearch={(value: string) => {
              setPage(1);
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 220 }}
            value={statusFilter}
            onChange={(value: SubmittalStatus | undefined) => {
              setPage(1);
              setStatusFilter(value);
            }}
            options={SUBMITTAL_WORKFLOW.map((step) => ({
              value: step.key,
              label: step.label,
            }))}
          />
        </Space>

        <DataTable<Submittal>
          rowKey="id"
          columns={columns}
          dataSource={submittals}
          locale={{ emptyText: 'No submittals found' }}
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

      <SubmittalFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void submittalsQuery.refetch()}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => void submittalsQuery.refetch()}
      />
    </>
  );
}
