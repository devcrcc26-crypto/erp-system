// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { ClipboardCheck } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
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
import { useDesignPackages } from '@/lib/query/design-packages';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useAllProjects } from '@/lib/query/projects';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatPunchItemStatus,
  isOverdue,
  punchItemSeverityVariant,
  punchItemStatusVariant,
} from '@/lib/utils/pm-status-display';
import { resolveDisciplineDisplayLabel } from '@/lib/utils/discipline-number';
import { PUNCH_ITEM_WORKFLOW } from '@/lib/api/workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import PunchItemDetailDrawer from '@/components/modules/projects/punch-items/PunchItemDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

const SEVERITY_OPTIONS: { value: PunchItemSeverity; label: string }[] = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
];

const CATEGORY_OPTIONS = [
  { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'ARCHITECTURAL', label: 'Architectural' },
  { value: 'MEP', label: 'MEP' },
  { value: 'CIVIL', label: 'Civil' },
  { value: 'FINISHING', label: 'Finishing' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'OTHER', label: 'Other' },
] as const;

const STATUS_OPTIONS = PUNCH_ITEM_WORKFLOW.map((step) => ({
  value: step.key as PunchItemStatus,
  label: step.label,
}));

type PunchScope = 'PROJECT' | 'DISCIPLINE' | 'SUBTASK';

interface PunchItemFormValues {
  description: string;
  category?: string;
  scope: PunchScope;
  taskDisciplineId?: string;
  designPackageId?: string;
  roomOrArea?: string;
  tradeResponsible?: string;
  severity: PunchItemSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
}

export function PunchItemFormDrawer({
  open,
  projectId: projectIdProp,
  showProjectSelector = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  onClose: () => void;
  onSaved: (created: PunchItem) => void;
}): React.ReactNode {
  const [form] = Form.useForm<PunchItemFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';
  const [scope, setScope] = useState<PunchScope>('PROJECT');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const createItem = useCreatePunchItem();
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} — ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const disciplinesQuery = useProjectDisciplines(
    effectiveProjectId,
    open && Boolean(effectiveProjectId) && scope !== 'PROJECT',
  );
  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((row) => {
        const number = resolveDisciplineDisplayLabel(row);
        return {
          value: row.id,
          label:
            number === row.disciplineName
              ? row.disciplineName
              : `${number} — ${row.disciplineName}`,
        };
      }),
    [disciplinesQuery.data],
  );

  const taskDisciplineId = Form.useWatch('taskDisciplineId', form);
  const packagesQuery = useDesignPackages(
    effectiveProjectId,
    taskDisciplineId ?? '',
    open &&
      scope === 'SUBTASK' &&
      Boolean(effectiveProjectId) &&
      Boolean(taskDisciplineId),
  );
  const packageOptions = useMemo(
    () =>
      (packagesQuery.data ?? []).map((pkg) => ({
        value: pkg.id,
        label: `${pkg.packageCode} — ${pkg.name}`,
      })),
    [packagesQuery.data],
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
  }, [open, projectIdProp]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setFileList([]);
      setScope('PROJECT');
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  async function handleSubmit(values: PunchItemFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    try {
      const result = await createItem.mutateAsync({
        projectId: effectiveProjectId,
        body: {
          description: values.description.trim(),
          category: values.category || undefined,
          severity: values.severity,
          roomOrArea: values.roomOrArea?.trim() || undefined,
          tradeResponsible: values.tradeResponsible?.trim() || undefined,
          dueDate: values.dueDate
            ? values.dueDate.format('YYYY-MM-DD')
            : undefined,
          assignedTo: values.assignedTo || undefined,
          taskDisciplineId:
            scope === 'DISCIPLINE' || scope === 'SUBTASK'
              ? values.taskDisciplineId
              : undefined,
          designPackageId:
            scope === 'SUBTASK' ? values.designPackageId : undefined,
        },
      });

      if (fileList.length > 0 && result.attachmentFolderId) {
        setUploading(true);
        try {
          const folderId = result.attachmentFolderId;
          await Promise.all(
            fileList.map(async (entry) => {
              const file = entry.originFileObj;
              if (!file) {
                return;
              }
              await uploadDocument.mutateAsync({
                folderId,
                file: file as File,
              });
            }),
          );
        } catch (uploadError) {
          notifyApiError(
            uploadError,
            'Punch item created but file upload failed. Upload from the detail drawer.',
            messageApi,
          );
          form.resetFields();
          setFileList([]);
          setScope('PROJECT');
          onSaved(result);
          onClose();
          return;
        } finally {
          setUploading(false);
        }
      }

      messageApi.success('Punch item created');
      form.resetFields();
      setFileList([]);
      setScope('PROJECT');
      onSaved(result);
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create punch item', messageApi);
    } finally {
      setUploading(false);
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
      {open ? (
        <Form<PunchItemFormValues>
          form={form}
          layout="vertical"
          className="erp-drawer-form"
          initialValues={{ severity: 'MINOR', scope: 'PROJECT' }}
          onFinish={(values: PunchItemFormValues) => void handleSubmit(values)}
        >
          {showProjectSelector && (
            <Form.Item label="Project" required>
              <Select
                showSearch
                placeholder="Select project"
                options={projectOptions}
                loading={projectsQuery.isLoading}
                optionFilterProp="label"
                value={selectedProjectId ?? undefined}
                onChange={(value: string) => {
                  setSelectedProjectId(value);
                  form.setFieldValue('taskDisciplineId', undefined);
                  form.setFieldValue('designPackageId', undefined);
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Describe the defect' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="What is wrong? Describe the defect or incomplete work."
            />
          </Form.Item>

          <Form.Item name="category" label="Category">
            <Select
              allowClear
              placeholder="Select category"
              options={[...CATEGORY_OPTIONS]}
            />
          </Form.Item>

          <Form.Item name="scope" label="Scope">
            <Radio.Group
              onChange={(e) => {
                const next = e.target.value as PunchScope;
                setScope(next);
                form.setFieldValue('taskDisciplineId', undefined);
                form.setFieldValue('designPackageId', undefined);
              }}
            >
              <Radio value="PROJECT">Project-wide</Radio>
              <Radio value="DISCIPLINE">Discipline</Radio>
              <Radio value="SUBTASK">Subtask</Radio>
            </Radio.Group>
          </Form.Item>

          {(scope === 'DISCIPLINE' || scope === 'SUBTASK') && (
            <Form.Item
              name="taskDisciplineId"
              label="Discipline"
              rules={[
                {
                  required: true,
                  message: 'Select discipline',
                },
              ]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select discipline"
                loading={disciplinesQuery.isLoading}
                disabled={!effectiveProjectId}
                options={disciplineOptions}
                onChange={() =>
                  form.setFieldValue('designPackageId', undefined)
                }
              />
            </Form.Item>
          )}

          {scope === 'SUBTASK' && (
            <Form.Item
              name="designPackageId"
              label="Subtask"
              rules={[
                {
                  required: true,
                  message: 'Select subtask',
                },
              ]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select subtask"
                loading={packagesQuery.isLoading}
                disabled={!taskDisciplineId}
                options={packageOptions}
              />
            </Form.Item>
          )}

          <Form.Item name="roomOrArea" label="Location / Area">
            <Input placeholder="Room, level, grid reference, or area description" />
          </Form.Item>

          <Form.Item name="tradeResponsible" label="Trade responsible">
            <Input placeholder="Which trade or contractor is responsible for fixing" />
          </Form.Item>

          <div className="flex gap-3">
            <Form.Item
              name="severity"
              label="Severity"
              rules={[{ required: true }]}
              className="flex-1"
              initialValue="MINOR"
            >
              <Select options={SEVERITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="dueDate" label="Due date" className="flex-1">
              <DatePicker className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="assignedTo" label="Assign to">
            <UserSelect
              placeholder="Assign now or later from the detail drawer"
              allowClear
            />
          </Form.Item>
          <p className="mb-3 -mt-3 text-xs text-[var(--color-text-tertiary)]">
            If assigned now, status will be set to Assigned automatically.
          </p>

          <Form.Item label="Photos / Evidence">
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: next }) => setFileList(next)}
              listType="picture"
            >
              <Button icon={<UploadOutlined />}>Select files</Button>
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createItem.isPending || uploading}
            >
              Create item
            </Button>
          </div>
        </Form>
      ) : null}
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
        onSaved={(created) => {
          void query.refetch();
          setSelectedId(created.id);
        }}
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
