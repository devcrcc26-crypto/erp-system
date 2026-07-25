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
import { ClipboardCheck } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PunchItem,
  PunchItemSeverity,
  PunchItemStatus,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCreatePunchItem,
  usePunchItems,
} from '@/lib/query/punch-items';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatPunchItemStatus,
  isOverdue,
  punchItemSeverityVariant,
  punchItemStatusVariant,
} from '@/lib/utils/pm-status-display';
import { PUNCH_ITEM_WORKFLOW } from '@/lib/api/workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import PunchItemDetailDrawer from '@/components/modules/projects/punch-items/PunchItemDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

const SEVERITY_OPTIONS: { value: PunchItemSeverity; label: string }[] = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_OPTIONS = PUNCH_ITEM_WORKFLOW.map((step) => ({
  value: step.key as PunchItemStatus,
  label: step.label,
}));

interface PunchItemFormValues {
  description: string;
  roomOrArea?: string;
  tradeResponsible?: string;
  severity: PunchItemSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
}

function PunchItemFormDrawer({
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
  const [form] = Form.useForm<PunchItemFormValues>();
  const createItem = useCreatePunchItem();
  const messageApi = useAppMessage();

  async function handleSubmit(values: PunchItemFormValues): Promise<void> {
    try {
      await createItem.mutateAsync({
        projectId,
        body: {
          description: values.description.trim(),
          roomOrArea: values.roomOrArea?.trim() || undefined,
          tradeResponsible: values.tradeResponsible?.trim() || undefined,
          severity: values.severity,
          assignedTo: values.assignedTo,
          dueDate: values.dueDate?.format('YYYY-MM-DD'),
        },
      });
      messageApi.success('Punch item created');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create punch item', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="New punch item"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<PunchItemFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ severity: 'MINOR' }}
        onFinish={(values: PunchItemFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Description is required' }]}
        >
          <Input.TextArea rows={3} placeholder="Describe the defect or incomplete work" />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Room / area" name="roomOrArea">
            <Input placeholder="Level 2, Room 204" />
          </Form.Item>
          <Form.Item label="Trade" name="tradeResponsible">
            <Input placeholder="e.g. Painting" />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Severity"
            name="severity"
            rules={[{ required: true }]}
          >
            <Select options={SEVERITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="Assigned to" name="assignedTo">
            <UserSelect allowClear />
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
            loading={createItem.isPending}
          >
            Create item
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function PunchItemsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PunchItemStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const query = usePunchItems(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const columns: ColumnsType<PunchItem> = useMemo(
    () => [
      {
        title: 'Punch #',
        dataIndex: 'punchNumber',
        key: 'punchNumber',
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
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: 'Area',
        dataIndex: 'roomOrArea',
        key: 'roomOrArea',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Trade',
        dataIndex: 'tradeResponsible',
        key: 'tradeResponsible',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        render: (severity: PunchItemSeverity) => (
          <StatusBadge
            label={severity}
            variant={punchItemSeverityVariant(severity)}
          />
        ),
      },
      {
        title: 'Assigned',
        dataIndex: 'assignedTo',
        key: 'assignedTo',
        render: (_: unknown, record: PunchItem) =>
          resolveUserDisplay(record.assignedTo, record.assignedToName, '-'),
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => {
          const overdue = isOverdue(value) && record.status !== 'CLOSED';
          return (
            <span className={overdue ? 'text-red-600' : undefined}>
              {formatProjectDate(value)}
            </span>
          );
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: PunchItemStatus) => (
          <StatusBadge
            label={formatPunchItemStatus(status)}
            variant={punchItemStatusVariant(status)}
          />
        ),
      },
    ],
    [resolveUserDisplay],
  );

  if (query.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <ProjectModuleGate projectId={projectId} module="punch_items">
    <>
      <FormLayout
        title="Punch list"
        description="Final walkthrough defects, corrections, and verification tracking."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New punch item
          </Button>
        }
      >
        {query.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load punch list"
            description={
              query.error instanceof ApiRequestError
                ? query.error.message
                : 'Please try again.'
            }
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search punch items"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
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
            onChange={(value: PunchItemStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
        </Space>

        <DataTable<PunchItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ClipboardCheck />}
                title="No punch items"
                description="Record walkthrough defects and track correction to closeout"
                action={{
                  label: 'New punch item',
                  onClick: () => setCreateOpen(true),
                }}
              />
            ),
          }}
        />
      </FormLayout>

      <PunchItemFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void query.refetch()}
      />

      <PunchItemDetailDrawer
        projectId={projectId}
        punchItemId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void query.refetch()}
      />
    </>
    </ProjectModuleGate>
  );
}
