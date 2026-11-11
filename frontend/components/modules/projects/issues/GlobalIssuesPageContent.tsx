'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AlertCircle } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
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
import {
  ISSUE_OPEN_STATUSES,
  ISSUE_RESOLVED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
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

/**
 * Global Issues list - cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalIssuesPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
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
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.issues.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewIssues();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.issues.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    severity: severityFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const openListParams = {
    ...(activeTab === 'active'
      ? params
      : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      ISSUE_OPEN_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const resolvedListParams = {
    ...(activeTab === 'closed'
      ? params
      : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      ISSUE_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myOpenQuery = useMyIssues(
    openListParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const myResolvedQuery = useMyIssues(
    resolvedListParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allOpenQuery = useAllIssues(
    openListParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const allResolvedQuery = useAllIssues(
    resolvedListParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );

  const openQuery = portfolioMode ? allOpenQuery : myOpenQuery;
  const resolvedQuery = portfolioMode ? allResolvedQuery : myResolvedQuery;
  const issuesQuery = activeTab === 'active' ? openQuery : resolvedQuery;

  const myProjectsQuery = useMyIssueProjects(
    capabilitiesReady && !portfolioMode && canCreate,
  );
  const allProjectsQuery = useAllProjects({}, capabilitiesReady && portfolioMode);

  const projectFilterOptions = useMemo(
    () =>
      portfolioMode
        ? (allProjectsQuery.data?.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} - ${p.name}`,
          }))
        : (myProjectsQuery.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} - ${p.name}`,
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
          record.assignedToName ?? record.assignedTo ?? '-',
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Issue) =>
          record.projectCode?.trim() || '-',
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record: Issue) =>
          record.linkedDesignPackage?.fullCode ?? '-',
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
      {
        title: '',
        key: 'actions',
        width: 80,
        render: (_: unknown, record: Issue) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${record.projectId}/issues/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [router],
  );

  if (!capabilitiesReady || (issuesQuery.isLoading && !issuesQuery.data)) {
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
  const openCount = openQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void openQuery.refetch();
    void resolvedQuery.refetch();
  };

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
            description="This page is ready - data will appear when the backend is available."
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

        <TableUpdatingIndicator
          active={issuesQuery.isFetching && Boolean(issuesQuery.data)}
        />

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
          refetchLists();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <IssueDetailDrawer
          projectId={selected.projectId}
          issueId={selected.issueId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      ) : null}
    </>
  );
}
