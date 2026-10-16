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
  Typography,
  Upload,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateRfiRequest,
  Rfi,
  RfiPriority,
  RfiSource,
  RfiStatus,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import {
  useCreateRfi,
  useEligibleRfiSubtasks,
  usePreviewRfiNumber,
  useRfis,
} from '@/lib/query/rfis';
import { useAllProjects } from '@/lib/query/projects';
import { useMeetings } from '@/lib/query/meetings';
import { useCorrespondence } from '@/lib/query/correspondence';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRfiStatus,
  isOverdue,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import {
  RFI_OPEN_STATUSES,
  RFI_RESOLVED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import RfiDetailDrawer from '@/components/modules/projects/rfis/RfiDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PRIORITY_OPTIONS: Array<{ value: RfiPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const RFI_SOURCE_OPTIONS: Array<{ value: RfiSource; label: string }> = [
  { value: 'SITE_TEAM', label: 'Site Team' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'CLIENT_CONSULTANT', label: 'Client / Consultant' },
  { value: 'INTER_DISCIPLINE', label: 'Inter-discipline' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'DAILY_LOG', label: 'Daily Log' },
  { value: 'SUBMITTAL_REVIEW', label: 'Submittal Review' },
];

interface RfiFormValues {
  projectId?: string;
  linkedDesignPackageId: string;
  rfiSource: RfiSource;
  title: string;
  description?: string;
  priority: RfiPriority;
  dueDate?: Dayjs;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
  directTo?: 'DESIGN_TEAM' | 'SITE_TEAM';
}

export function RfiFormDrawer({
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
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<RfiFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';

  const createRfi = useCreateRfi();
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const subtasksQuery = useEligibleRfiSubtasks(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const subtaskOptions = useMemo(
    () =>
      (subtasksQuery.data ?? []).map((pkg) => ({
        value: pkg.id,
        label: `${pkg.fullCode} - ${pkg.name}`,
      })),
    [subtasksQuery.data],
  );

  const selectedPackageId = Form.useWatch('linkedDesignPackageId', form) as
    | string
    | undefined;

  const previewNumberQuery = usePreviewRfiNumber(
    effectiveProjectId,
    selectedPackageId ?? '',
    open && Boolean(effectiveProjectId) && Boolean(selectedPackageId),
  );

  const selectedSubtask = useMemo(
    () =>
      (subtasksQuery.data ?? []).find((s) => s.id === selectedPackageId) ??
      null,
    [subtasksQuery.data, selectedPackageId],
  );

  const sourceEntityType = Form.useWatch('sourceEntityType', form);
  const meetingsQuery = useMeetings(
    effectiveProjectId,
    { page: 1, limit: 50 },
    open && Boolean(effectiveProjectId) && sourceEntityType === 'MEETING',
  );
  const correspondenceQuery = useCorrespondence(
    effectiveProjectId,
    { page: 1, limit: 50 },
    open && Boolean(effectiveProjectId) && sourceEntityType === 'CORRESPONDENCE',
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
  }, [open, projectIdProp]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setQueuedFiles([]);
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  const rfiSource = Form.useWatch('rfiSource', form);
  const title = Form.useWatch('title', form);
  const directTo = Form.useWatch('directTo', form) ?? 'DESIGN_TEAM';
  const submitDisabled =
    !selectedPackageId ||
    !rfiSource ||
    !title?.trim();

  const hasSiteRep = Boolean(selectedSubtask?.siteRepresentativeUserId);
  const autoAssignedToName =
    hasSiteRep && directTo === 'SITE_TEAM'
      ? selectedSubtask?.siteRepresentativeName
      : selectedSubtask?.designerName;

  async function uploadQueuedFiles(folderId: string): Promise<void> {
    setUploading(true);
    await Promise.all(
      queuedFiles.map((file) =>
        uploadDocument.mutateAsync({ folderId, file }),
      ),
    );
  }

  async function handleSubmit(values: RfiFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    const body: CreateRfiRequest = {
      linkedDesignPackageId: values.linkedDesignPackageId,
      rfiSource: values.rfiSource,
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      priority: values.priority,
      dueDate: values.dueDate?.toISOString(),
      sourceEntityType: values.sourceEntityType || undefined,
      sourceEntityId: values.sourceEntityId || undefined,
      directTo: hasSiteRep ? values.directTo ?? 'DESIGN_TEAM' : undefined,
    };
    try {
      const result = await createRfi.mutateAsync({
        projectId: effectiveProjectId,
        body,
      });

      if (queuedFiles.length > 0 && result.attachmentFolderId) {
        try {
          await uploadQueuedFiles(result.attachmentFolderId);
        } catch {
          messageApi.warning(
            'RFI created but file upload failed. You can add files from the RFI detail page.',
          );
          form.resetFields();
          setQueuedFiles([]);
          onSaved();
          onClose();
          return;
        }
      }

      messageApi.success('RFI created successfully');
      form.resetFields();
      setQueuedFiles([]);
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create RFI', messageApi);
    } finally {
      setUploading(false);
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
                form.setFieldValue('linkedDesignPackageId', undefined);
                form.setFieldValue('sourceEntityId', undefined);
              }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Subtask"
          name="linkedDesignPackageId"
          rules={[{ required: true, message: 'Subtask is required' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select subtask"
            loading={subtasksQuery.isLoading}
            disabled={!effectiveProjectId}
            options={subtaskOptions}
            onChange={() => {
              form.setFieldValue('sourceEntityId', undefined);
              form.setFieldValue('directTo', 'DESIGN_TEAM');
            }}
          />
        </Form.Item>

        <Form.Item label="RFI Number">
          <Input
            value={
              previewNumberQuery.data?.rfiNumber ??
              (selectedPackageId ? 'Loading…' : 'Select a subtask first')
            }
            disabled
          />
        </Form.Item>

        {hasSiteRep && (
          <Form.Item
            name="directTo"
            label="Direct to"
            initialValue="DESIGN_TEAM"
          >
            <Radio.Group>
              <Radio value="DESIGN_TEAM">
                Design Team
                <span className="ml-1 text-muted text-xs">
                  ({selectedSubtask?.designerName ?? 'No designer assigned'})
                </span>
              </Radio>
              <Radio value="SITE_TEAM">
                Site Team
                <span className="ml-1 text-muted text-xs">
                  ({selectedSubtask?.siteRepresentativeName})
                </span>
              </Radio>
            </Radio.Group>
          </Form.Item>
        )}

        {selectedSubtask && (
          <Form.Item label="Assigned to">
            <Typography.Text type="secondary">
              Auto-assigned to: <strong>{autoAssignedToName ?? 'No designer assigned'}</strong>
            </Typography.Text>
          </Form.Item>
        )}

        <Form.Item
          label="RFI Source"
          name="rfiSource"
          rules={[{ required: true, message: 'RFI source is required' }]}
        >
          <Select placeholder="Select source" options={RFI_SOURCE_OPTIONS} />
        </Form.Item>

        <Form.Item
          label="Priority"
          name="priority"
          rules={[{ required: true, message: 'Priority is required' }]}
        >
          <Select options={PRIORITY_OPTIONS} />
        </Form.Item>

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

        <Form.Item label="Attachments">
          <Upload
            multiple
            beforeUpload={(file) => {
              setQueuedFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setQueuedFiles((prev) =>
                prev.filter((f) => f.name !== file.name),
              );
            }}
            fileList={queuedFiles.map((f) => ({
              uid: f.name,
              name: f.name,
              status: 'done' as const,
            }))}
          >
            <Button icon={<UploadOutlined />}>Add files</Button>
          </Upload>
        </Form.Item>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createRfi.isPending || uploading}
            disabled={submitDisabled}
          >
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
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<string | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const permLoading = usePermissionsLoading();

  const filterParams = {
    search: search.trim() || undefined,
    priority: priorityFilter,
  };

  const openRfisQuery = useRfis(projectId, {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RFI_OPEN_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  }, !permLoading);

  const resolvedRfisQuery = useRfis(projectId, {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RFI_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  }, !permLoading);

  const rfisQuery = activeTab === 'active' ? openRfisQuery : resolvedRfisQuery;

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
        title: 'Source',
        dataIndex: 'rfiSource',
        key: 'rfiSource',
        render: (value: RfiSource | null) => {
          if (!value) return '-';
          return RFI_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
        },
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
        render: (_: unknown, record: Rfi) =>
          resolveUserDisplay(record.assignedTo, record.assignedToName, '-'),
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
      {
        title: '',
        key: 'actions',
        width: 80,
        render: (_: unknown, record: Rfi) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${projectId}/rfis/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay, router, projectId],
  );

  if (rfisQuery.isLoading && !rfisQuery.data) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    rfisQuery.isError &&
    rfisQuery.error instanceof ApiRequestError &&
    (rfisQuery.error.status === 404 || rfisQuery.error.status === 0);

  const rfis = rfisQuery.data?.data ?? [];
  const meta = rfisQuery.data?.meta;
  const openCount = openRfisQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedRfisQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void openRfisQuery.refetch();
    void resolvedRfisQuery.refetch();
  };

  return (
    <ProjectModuleGate projectId={projectId} module="rfis">
    <>
      <FormLayout
        title="RFIs"
        description="Requests for information - track clarifications from design to closeout."
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
            description="This page is ready - data will appear when the project management backend module is available."
          />
        )}

        <ListStatusTabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setStatusFilter(undefined);
            resetPage();
          }}
          activeLabel="Open"
          closedLabel="Resolved"
          activeCount={openCount}
          closedCount={resolvedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search RFIs"
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
            className={layout.filterControlSm}
            value={statusFilter}
            onChange={(value: RfiStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(RFI_OPEN_STATUSES, formatRfiStatus)
                : buildTabStatusFilterOptions(RFI_RESOLVED_STATUSES, formatRfiStatus)
            }
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

        <TableUpdatingIndicator
          active={rfisQuery.isFetching && Boolean(rfisQuery.data)}
        />

        <DataTable<Rfi>
          rowKey="id"
          columns={columns}
          dataSource={rfis}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedRfiId(record.id),
            style: { cursor: 'pointer' },
          })}
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
        onSaved={() => refetchLists()}
      />

      <RfiDetailDrawer
        projectId={projectId}
        rfiId={selectedRfiId}
        onClose={() => setSelectedRfiId(null)}
        onUpdated={() => refetchLists()}
      />
    </>
    </ProjectModuleGate>
  );
}
