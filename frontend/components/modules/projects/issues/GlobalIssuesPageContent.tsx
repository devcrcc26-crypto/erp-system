'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AlertCircle } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { Issue, IssueSeverity, IssueStatus } from '@/lib/api/project-management.types';
import { useMyIssues, useAllIssues, useMyIssueProjects } from '@/lib/query/issues';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  isOverdue,
  issueSeverityVariant,
  issueStatusVariant,
} from '@/lib/utils/pm-status-display';
import { IssueFormDrawer } from '@/components/modules/projects/issues/IssuesPageContent';
import IssueDetailDrawer from '@/components/modules/projects/issues/IssueDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewIssues,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { tokens } from '@/lib/theme/tokens';

const SEVERITY_OPTIONS: Array<{ value: IssueSeverity; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_OPTIONS: Array<{ value: IssueStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CLOSED', label: 'Closed' },
];

/**
 * Global Issues list — cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalIssuesPageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | undefined>();
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    issueId: string;
  } | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    useGlobalPortfolioListMode() &&
    pm.issues.canView &&
    !epc.navDesigner &&
    !epc.navDisciplineLeader;
  const canViewPersonal = useCanViewIssues();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navDisciplineLeader || epc.navDesigner || pm.issues.canCreate;

  const listParams = {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    severity: severityFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const myIssuesQuery = useMyIssues(
    listParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allIssuesQuery = useAllIssues(
    listParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const issuesQuery = portfolioMode ? allIssuesQuery : myIssuesQuery;

  const myProjectsQuery = useMyIssueProjects(
    capabilitiesReady && !portfolioMode && canCreate,
  );
  const allProjectsQuery = useAllProjects({}, capabilitiesReady && portfolioMode);

  const projectFilterOptions = useMemo(
    () =>
      portfolioMode
        ? (allProjectsQuery.data?.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} — ${p.name}`,
          }))
        : (myProjectsQuery.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} — ${p.name}`,
          })),
    [portfolioMode, allProjectsQuery.data?.data, myProjectsQuery.data],
  );

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
            style={{ color: tokens.colorTeal600 }}
            onClick={() =>
              setSelected({ projectId: record.projectId, issueId: record.id })
            }
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
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        render: (severity: IssueSeverity) => (
          <StatusBadge label={severity} variant={issueSeverityVariant(severity)} />
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
        key: 'assignedTo',
        render: (_: unknown, record: Issue) =>
          record.assignedToName ?? record.assignedTo ?? '—',
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Issue) => {
          const code = record.projectCode?.trim();
          const name = record.projectName?.trim();
          if (code && name) return `${code} — ${name}`;
          return name ?? code ?? '—';
        },
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record: Issue) =>
          record.linkedDesignPackage?.fullCode ?? '—',
      },
      {
        title: 'Due date',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record: Issue) => (
          <span
            style={
              isOverdue(value) && record.status !== 'CLOSED'
                ? { color: tokens.colorRed600, fontWeight: 500 }
                : undefined
            }
          >
            {formatProjectDate(value)}
          </span>
        ),
      },
    ],
    [],
  );

  if (!capabilitiesReady || issuesQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to view issues."
      />
    );
  }

  const apiUnavailable =
    issuesQuery.isError &&
    issuesQuery.error instanceof ApiRequestError &&
    (issuesQuery.error.status === 404 || issuesQuery.error.status === 0);

  const rows = issuesQuery.data?.data ?? [];
  const meta = issuesQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Issues"
        description={
          portfolioMode
            ? 'All issues across projects.'
            : 'Issues assigned to or raised by you.'
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              Raise issue
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Issue APIs are not connected yet."
            description="This page is ready — data will appear when the backend is available."
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by type or issue number"
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
            options={STATUS_OPTIONS}
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
          {portfolioMode ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className={layout.filterControl}
              value={projectFilter}
              optionFilterProp="label"
              loading={allProjectsQuery.isLoading}
              onChange={(value: string | undefined) => {
                resetPage();
                setProjectFilter(value);
              }}
              options={projectFilterOptions}
            />
          ) : null}
        </Space>

        <DataTable<Issue>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({ projectId: record.projectId, issueId: record.id }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<AlertCircle />}
                title="No issues found"
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'Raise issue',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <IssueFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          void issuesQuery.refetch();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <IssueDetailDrawer
          projectId={selected.projectId}
          issueId={selected.issueId}
          onClose={() => setSelected(null)}
          onUpdated={() => void issuesQuery.refetch()}
        />
      ) : null}
    </>
  );
}
