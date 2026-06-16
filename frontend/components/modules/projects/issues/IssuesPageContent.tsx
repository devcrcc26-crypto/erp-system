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
  CreateIssueRequest,
  Issue,
  IssueSeverity,
  IssueStatus,
} from '@/lib/api/project-management.types';
import { ISSUE_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useCreateIssue,
  useIssues,
  useUpdateIssue,
} from '@/lib/query/issues';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
  isOverdue,
} from '@/lib/utils/pm-status-display';
import IssueDetailDrawer from '@/components/modules/projects/issues/IssueDetailDrawer';

const PAGE_SIZE = 20;

const SEVERITY_OPTIONS: Array<{ value: IssueSeverity; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface IssueFormValues {
  issueType: string;
  description: string;
  location?: string;
  severity: IssueSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
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

  async function handleSubmit(values: IssueFormValues): Promise<void> {
    const body: CreateIssueRequest = {
      issueType: values.issueType.trim(),
      description: values.description.trim(),
      location: values.location?.trim() || undefined,
      severity: values.severity,
      assignedTo: values.assignedTo,
      dueDate: values.dueDate?.toISOString(),
    };
    await createIssue.mutateAsync({ projectId, body });
    form.resetFields();
    onSaved();
    onClose();
  }

  return (
    <Drawer
      open={open}
      title="Raise issue"
      onClose={onClose}
      size="large"
      destroyOnHidden
    >
      <Form<IssueFormValues>
        form={form}
        layout="vertical"
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
        <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | undefined>();
  const [severityFilter, setSeverityFilter] = useState<
    IssueSeverity | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const issuesQuery = useIssues(projectId, {
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
    status: statusFilter,
    severity: severityFilter,
  });

  const columns: ColumnsType<Issue> = useMemo(
    () => [
      {
        title: 'Issue #',
        dataIndex: 'issueNumber',
        key: 'issueNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
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
        render: (value: string | null) => value ?? '—',
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
        render: (userId: string | null) =>
          userId ? resolveUserName(userId) : '—',
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span
            className={
              isOverdue(value) && record.status !== 'CLOSED'
                ? 'font-medium text-red-600'
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

  if (issuesQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const apiUnavailable =
    issuesQuery.isError &&
    issuesQuery.error instanceof ApiRequestError &&
    (issuesQuery.error.status === 404 || issuesQuery.error.status === 0);

  const issues = issuesQuery.data?.data ?? [];
  const meta = issuesQuery.data?.meta;

  return (
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
            message="Issue APIs are not connected yet."
            description="This page is ready — data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search issues"
            style={{ width: 220 }}
            onSearch={(value: string) => {
              setPage(1);
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 180 }}
            value={statusFilter}
            onChange={(value: IssueStatus | undefined) => {
              setPage(1);
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
            style={{ width: 140 }}
            value={severityFilter}
            onChange={(value: IssueSeverity | undefined) => {
              setPage(1);
              setSeverityFilter(value);
            }}
            options={SEVERITY_OPTIONS}
          />
        </Space>

        <DataTable<Issue>
          rowKey="id"
          columns={columns}
          dataSource={issues}
          locale={{ emptyText: 'No issues found' }}
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
  );
}
