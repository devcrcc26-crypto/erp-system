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
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateRfiRequest,
  Rfi,
  RfiPriority,
  RfiStatus,
} from '@/lib/api/project-management.types';
import { RFI_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCreateRfi,
  useRfis,
  useUpdateRfi,
} from '@/lib/query/rfis';
import { useMeetings } from '@/lib/query/meetings';
import { useCorrespondence } from '@/lib/query/correspondence';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRfiStatus,
  isOverdue,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import RfiDetailDrawer from '@/components/modules/projects/rfis/RfiDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PRIORITY_OPTIONS: Array<{ value: RfiPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'DAILY_LOG', label: 'Daily Log' },
  { value: 'SUBMITTAL_REVIEW', label: 'Submittal Review' },
];

interface RfiFormValues {
  title: string;
  description?: string;
  discipline?: string;
  taskDisciplineId?: string;
  priority: RfiPriority;
  assignedTo?: string;
  dueDate?: Dayjs;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
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
  const messageApi = useAppMessage();
  const disciplinesQuery = useProjectDisciplines(projectId, open);
  const sourceEntityType = Form.useWatch('sourceEntityType', form);
  const meetingsQuery = useMeetings(projectId, { page: 1, limit: 50 }, open && sourceEntityType === 'MEETING');
  const correspondenceQuery = useCorrespondence(projectId, { page: 1, limit: 50 }, open && sourceEntityType === 'CORRESPONDENCE');

  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((row) => ({
        value: row.id,
        label: `${row.taskName} - ${row.disciplineName}`,
      })),
    [disciplinesQuery.data],
  );

  async function handleSubmit(values: RfiFormValues): Promise<void> {
    const body: CreateRfiRequest = {
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      discipline: values.discipline?.trim() || undefined,
      taskDisciplineId: values.taskDisciplineId,
      priority: values.priority,
      assignedTo: values.assignedTo,
      dueDate: values.dueDate?.toISOString(),
      sourceEntityType: values.sourceEntityType || undefined,
      sourceEntityId: values.sourceEntityId || undefined,
    };
    try {
      await createRfi.mutateAsync({ projectId, body });
      messageApi.success('RFI created successfully');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create RFI', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="Raise RFI"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<RfiFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
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
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Linked discipline" name="taskDisciplineId">
            <Select
              allowClear
              placeholder="Select engineering discipline"
              loading={disciplinesQuery.isLoading}
              options={disciplineOptions}
            />
          </Form.Item>
          <Form.Item label="Discipline label" name="discipline">
            <Input placeholder="e.g. Structural (optional display)" />
          </Form.Item>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Priority"
            name="priority"
            rules={[{ required: true, message: 'Priority is required' }]}
          >
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="Assigned to" name="assignedTo">
            <UserSelect placeholder="Select reviewer" />
          </Form.Item>
        </div>
        <Form.Item label="Due date" name="dueDate">
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Source type" name="sourceEntityType">
          <Select
            allowClear
            placeholder="Select source of this RFI (optional)"
            options={SOURCE_TYPE_OPTIONS}
            onChange={() => form.setFieldValue('sourceEntityId', undefined)}
          />
        </Form.Item>
        {sourceEntityType && (
          <Form.Item label="Source entity" name="sourceEntityId">
            {sourceEntityType === 'MEETING' ? (
              <Select
                allowClear
                placeholder="Select meeting"
                loading={meetingsQuery.isLoading}
                options={(meetingsQuery.data?.data ?? []).map((m) => ({
                  value: m.id,
                  label: m.title,
                }))}
              />
            ) : sourceEntityType === 'CORRESPONDENCE' ? (
              <Select
                allowClear
                placeholder="Select correspondence"
                loading={correspondenceQuery.isLoading}
                options={(correspondenceQuery.data?.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.subject,
                }))}
              />
            ) : (
              <Input placeholder="Paste entity ID" />
            )}
          </Form.Item>
        )}
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
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const permLoading = usePermissionsLoading();
  const rfisQuery = useRfis(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    priority: priorityFilter,
  }, !permLoading);

  const columns: ColumnsType<Rfi> = useMemo(
    () => [
      {
        title: 'RFI #',
        dataIndex: 'rfiNumber',
        key: 'rfiNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className={`!px-0 ${layout.traceabilityLinkClass}`}
            style={{ color: tokens.colorTeal600 }}
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
        render: (value: string | null) => value ?? '-',
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
          userId ? resolveUserName(userId) : '-',
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span
            className={
              isOverdue(value) && record.status !== 'CLOSED'
                ? 'font-medium'
                : undefined
            }
            style={
              isOverdue(value) && record.status !== 'CLOSED'
                ? { color: tokens.colorRed600 }
                : undefined
            }
          >
            {formatProjectDate(value)}
          </span>
        ),
      },
    ],
    [resolveUserName],
  );

  if (rfisQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    rfisQuery.isError &&
    rfisQuery.error instanceof ApiRequestError &&
    (rfisQuery.error.status === 404 || rfisQuery.error.status === 0);

  const rfis = rfisQuery.data?.data ?? [];
  const meta = rfisQuery.data?.meta;

  return (
    <ProjectModuleGate projectId={projectId} module="rfis">
    <>
      <FormLayout
        title="RFIs"
        description="Requests for information -track clarifications from design to closeout."
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
            title="RFI APIs are not connected yet."
            description="This page is ready -data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search RFIs"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlNav}
            value={statusFilter}
            onChange={(value: RfiStatus | undefined) => {
              resetPage();
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
            className={layout.filterControlXs}
            value={priorityFilter}
            onChange={(value: RfiPriority | undefined) => {
              resetPage();
              setPriorityFilter(value);
            }}
            options={PRIORITY_OPTIONS}
          />
        </Space>

        <DataTable<Rfi>
          rowKey="id"
          columns={columns}
          dataSource={rfis}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FileText />}
                title="No RFIs yet"
                description="Raise an RFI to track requests for information"
                action={
                  !apiUnavailable
                    ? { label: 'Raise RFI', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
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
    </ProjectModuleGate>
  );
}
