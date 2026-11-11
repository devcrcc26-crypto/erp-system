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
  Select,
  Space,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AlertCircle } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateIssueRequest,
  Issue,
  IssueSeverity,
  IssueStatus,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCreateIssue,
  useIssues,
  useUpdateIssue,
} from '@/lib/query/issues';
import { useAllProjects } from '@/lib/query/projects';
import { useMeetings } from '@/lib/query/meetings';
import { useCorrespondence } from '@/lib/query/correspondence';
import { useDesignPackages } from '@/lib/query/design-packages';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import { formatDisciplineNumber as formatTaskDisciplineNumber } from '@/lib/utils/discipline-number';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
  isOverdue,
} from '@/lib/utils/pm-status-display';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import {
  ISSUE_OPEN_STATUSES,
  ISSUE_RESOLVED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import IssueDetailDrawer from '@/components/modules/projects/issues/IssueDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const SEVERITY_OPTIONS: Array<{ value: IssueSeverity; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'DAILY_LOG', label: 'Daily Log' },
  { value: 'SUBMITTAL_REVIEW', label: 'Submittal Review' },
];

interface IssueFormValues {
  projectId?: string;
  issueType: string;
  description: string;
  location?: string;
  taskDisciplineId?: string;
  linkedDesignPackageId?: string;
  severity: IssueSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
}

export function IssueFormDrawer({
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
  const [form] = Form.useForm<IssueFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';

  const createIssue = useCreateIssue();
  const messageApi = useAppMessage();

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const disciplinesQuery = useProjectDisciplines(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const sourceEntityType = Form.useWatch('sourceEntityType', form);
  const meetingsQuery = useMeetings(effectiveProjectId, { page: 1, limit: 50 }, open && Boolean(effectiveProjectId) && sourceEntityType === 'MEETING');
  const correspondenceQuery = useCorrespondence(effectiveProjectId, { page: 1, limit: 50 }, open && Boolean(effectiveProjectId) && sourceEntityType === 'CORRESPONDENCE');

  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((row) => {
        const disciplineNumber =
          row.disciplineNumber?.trim() ||
          formatTaskDisciplineNumber(
            row.overseasTaskNumber,
            row.disciplineIndex,
          ) ||
          formatDisciplineLabel(row.disciplineIndex);
        return {
          value: row.id,
          label: `${disciplineNumber} - ${row.disciplineName}`,
        };
      }),
    [disciplinesQuery.data],
  );

  const taskDisciplineId = Form.useWatch('taskDisciplineId', form);
  const subtasksQuery = useDesignPackages(
    effectiveProjectId,
    taskDisciplineId ?? '',
    open && Boolean(effectiveProjectId) && Boolean(taskDisciplineId),
  );
  const subtaskOptions = useMemo(
    () =>
      (subtasksQuery.data ?? []).map((pkg) => ({
        value: pkg.id,
        label: `${pkg.packageCode} - ${pkg.name}`,
      })),
    [subtasksQuery.data],
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
  }, [open, projectIdProp]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  function handleSubtaskChange(packageId: string | undefined): void {
    form.setFieldValue('sourceEntityId', undefined);
    if (!packageId) {
      return;
    }
    const pkg = (subtasksQuery.data ?? []).find((p) => p.id === packageId);
    if (pkg?.disciplinaryLeaderUserId) {
      form.setFieldValue('assignedTo', pkg.disciplinaryLeaderUserId);
    }
  }

  async function handleSubmit(values: IssueFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    const body: CreateIssueRequest = {
      issueType: values.issueType.trim(),
      description: values.description.trim(),
      location: values.location?.trim() || undefined,
      taskDisciplineId: values.taskDisciplineId,
      linkedDesignPackageId: values.linkedDesignPackageId,
      severity: values.severity,
      assignedTo: values.assignedTo,
      dueDate: values.dueDate?.toISOString(),
      sourceEntityType: values.sourceEntityType || undefined,
      sourceEntityId: values.sourceEntityId || undefined,
    };
    try {
      await createIssue.mutateAsync({ projectId: effectiveProjectId, body });
      messageApi.success('Issue created successfully');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create issue', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="Raise issue"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<IssueFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ severity: 'MEDIUM' }}
        onFinish={(values: IssueFormValues) => void handleSubmit(values)}
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
                form.setFieldValue('linkedDesignPackageId', undefined);
                form.setFieldValue('sourceEntityId', undefined);
              }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Issue type"
          name="issueType"
          rules={[{ required: true, message: 'Issue type is required' }]}
        >
          <Input placeholder="e.g. Defect, Safety, Quality" />
        </Form.Item>
        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Description is required' }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="Location" name="location">
          <Input placeholder="Room, level, or grid reference" />
        </Form.Item>
        <Form.Item label="Linked discipline" name="taskDisciplineId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Select engineering discipline"
            loading={disciplinesQuery.isLoading}
            disabled={!effectiveProjectId}
            options={disciplineOptions}
            onChange={() => {
              form.setFieldValue('linkedDesignPackageId', undefined);
            }}
          />
        </Form.Item>
        {taskDisciplineId && (
          <Form.Item label="Linked subtask" name="linkedDesignPackageId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select subtask (optional)"
              loading={subtasksQuery.isLoading}
              options={subtaskOptions}
              onChange={handleSubtaskChange}
            />
          </Form.Item>
        )}
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Severity"
            name="severity"
            rules={[{ required: true, message: 'Severity is required' }]}
          >
            <Select options={SEVERITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="Due date" name="dueDate">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>
        <Form.Item label="Assigned to" name="assignedTo">
          <UserSelect placeholder="Assign responsible person" />
        </Form.Item>
        {taskDisciplineId && (
          <Typography.Text type="secondary" className="!-mt-3 !mb-4 !block">
            Auto-filled from the subtask&apos;s discipline lead when a subtask is
            selected - you can still change it above.
          </Typography.Text>
        )}
        <Form.Item label="Source type" name="sourceEntityType">
          <Select
            allowClear
            placeholder="Select source of this issue (optional)"
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
          <Button
            type="primary"
            htmlType="submit"
            loading={createIssue.isPending}
          >
            Create issue
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function IssuesPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | undefined>();
  const [severityFilter, setSeverityFilter] = useState<
    IssueSeverity | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const permLoading = usePermissionsLoading();

  const filterParams = {
    search: search.trim() || undefined,
    severity: severityFilter,
  };

  const openIssuesQuery = useIssues(projectId, {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      ISSUE_OPEN_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  }, !permLoading);

  const resolvedIssuesQuery = useIssues(projectId, {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      ISSUE_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  }, !permLoading);

  const issuesQuery = activeTab === 'active' ? openIssuesQuery : resolvedIssuesQuery;

  const columns: ColumnsType<Issue> = useMemo(
    () => [
      {
        title: 'Issue #',
        dataIndex: 'issueNumber',
        key: 'issueNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className={`!px-0 ${layout.traceabilityLinkClass}`}
            style={{ color: tokens.colorTeal600 }}
            onClick={() => setSelectedIssueId(record.id)}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Type',
        dataIndex: 'issueType',
        key: 'issueType',
      },
      {
        title: 'Location',
        dataIndex: 'location',
        key: 'location',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        render: (severity: IssueSeverity) => (
          <StatusBadge
            label={severity}
            variant={issueSeverityVariant(severity)}
          />
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: IssueStatus) => (
          <StatusBadge
            label={formatIssueStatus(status)}
            variant={issueStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Assigned to',
        dataIndex: 'assignedTo',
        key: 'assignedTo',
        render: (_: unknown, record: Issue) =>
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
        render: (_: unknown, record: Issue) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${projectId}/issues/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay, router, projectId],
  );

  if (issuesQuery.isLoading && !issuesQuery.data) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    issuesQuery.isError &&
    issuesQuery.error instanceof ApiRequestError &&
    (issuesQuery.error.status === 404 || issuesQuery.error.status === 0);

  const issues = issuesQuery.data?.data ?? [];
  const meta = issuesQuery.data?.meta;
  const openCount = openIssuesQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedIssuesQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void openIssuesQuery.refetch();
    void resolvedIssuesQuery.refetch();
  };

  return (
    <ProjectModuleGate projectId={projectId} module="issues">
    <>
      <FormLayout
        title="Issues & defects"
        description="Track site issues from identification through verification and closeout."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            disabled={apiUnavailable}
          >
            Raise issue
          </Button>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Issue APIs are not connected yet."
            description="This page is ready -data will appear when the project management backend module is available."
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
            placeholder="Search issues"
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
            onChange={(value: IssueStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(ISSUE_OPEN_STATUSES, formatIssueStatus)
                : buildTabStatusFilterOptions(
                    ISSUE_RESOLVED_STATUSES,
                    formatIssueStatus,
                  )
            }
          />
          <Select
            allowClear
            placeholder="Severity"
            className={layout.filterControlXs}
            value={severityFilter}
            onChange={(value: IssueSeverity | undefined) => {
              resetPage();
              setSeverityFilter(value);
            }}
            options={SEVERITY_OPTIONS}
          />
        </Space>

        <TableUpdatingIndicator
          active={issuesQuery.isFetching && Boolean(issuesQuery.data)}
        />

        <DataTable<Issue>
          rowKey="id"
          columns={columns}
          dataSource={issues}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedIssueId(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<AlertCircle />}
                title="No issues logged"
                description="Log an issue to track site problems"
                action={
                  !apiUnavailable
                    ? { label: 'Log issue', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <IssueFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetchLists()}
      />

      <IssueDetailDrawer
        projectId={projectId}
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        onUpdated={() => refetchLists()}
      />
    </>
    </ProjectModuleGate>
  );
}
