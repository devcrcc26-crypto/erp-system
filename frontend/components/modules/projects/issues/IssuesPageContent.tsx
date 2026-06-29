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
import { AlertCircle } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateIssueRequest,
  Issue,
  IssueSeverity,
  IssueStatus,
} from '@/lib/api/project-management.types';
import { ISSUE_WORKFLOW } from '@/lib/api/workflow';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCreateIssue,
  useIssues,
  useUpdateIssue,
} from '@/lib/query/issues';
import { useMeetings } from '@/lib/query/meetings';
import { useCorrespondence } from '@/lib/query/correspondence';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
  isOverdue,
} from '@/lib/utils/pm-status-display';
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
  issueType: string;
  description: string;
  location?: string;
  taskDisciplineId?: string;
  severity: IssueSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
}

function IssueFormDrawer({
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
  const [form] = Form.useForm<IssueFormValues>();
  const createIssue = useCreateIssue();
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

  async function handleSubmit(values: IssueFormValues): Promise<void> {
    const body: CreateIssueRequest = {
      issueType: values.issueType.trim(),
      description: values.description.trim(),
      location: values.location?.trim() || undefined,
      taskDisciplineId: values.taskDisciplineId,
      severity: values.severity,
      assignedTo: values.assignedTo,
      dueDate: values.dueDate?.toISOString(),
      sourceEntityType: values.sourceEntityType || undefined,
      sourceEntityId: values.sourceEntityId || undefined,
    };
    try {
      await createIssue.mutateAsync({ projectId, body });
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
            placeholder="Select engineering discipline"
            loading={disciplinesQuery.isLoading}
            options={disciplineOptions}
          />
        </Form.Item>
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
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | undefined>();
  const [severityFilter, setSeverityFilter] = useState<
    IssueSeverity | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const permLoading = usePermissionsLoading();
  const issuesQuery = useIssues(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    severity: severityFilter,
  }, !permLoading);

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
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
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
    ],
    [resolveUserDisplay],
  );

  if (issuesQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    issuesQuery.isError &&
    issuesQuery.error instanceof ApiRequestError &&
    (issuesQuery.error.status === 404 || issuesQuery.error.status === 0);

  const issues = issuesQuery.data?.data ?? [];
  const meta = issuesQuery.data?.meta;

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
            options={ISSUE_WORKFLOW.map((step) => ({
              value: step.key,
              label: step.label,
            }))}
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

        <DataTable<Issue>
          rowKey="id"
          columns={columns}
          dataSource={issues}
          pagination={bindMeta(meta)}
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
        onSaved={() => void issuesQuery.refetch()}
      />

      <IssueDetailDrawer
        projectId={projectId}
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        onUpdated={() => void issuesQuery.refetch()}
      />
    </>
    </ProjectModuleGate>
  );
}
