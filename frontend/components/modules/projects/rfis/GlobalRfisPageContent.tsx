'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Rfi,
  RfiPriority,
  RfiSource,
  RfiStatus,
} from '@/lib/api/project-management.types';
import {
  useMyRfis,
  useAllRfis,
  useMyRfiProjects,
} from '@/lib/query/rfis';
import { useAllProjects } from '@/lib/query/projects';
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
import { RfiFormDrawer } from '@/components/modules/projects/rfis/RfisPageContent';
import RfiDetailDrawer from '@/components/modules/projects/rfis/RfiDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewRfis,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { tokens } from '@/lib/theme/tokens';

const RFI_SOURCE_LABELS: Record<RfiSource, string> = {
  SITE_TEAM: 'Site Team',
  CONTRACTOR: 'Contractor',
  CLIENT_CONSULTANT: 'Client / Consultant',
  INTER_DISCIPLINE: 'Inter-discipline',
};

const PRIORITY_OPTIONS: Array<{ value: RfiPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

/**
 * Global RFIs list - cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalRfisPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RfiStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    rfiId: string;
  } | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.rfis.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewRfis();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.rfis.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    priority: priorityFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const openListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RFI_OPEN_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const resolvedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RFI_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myOpenQuery = useMyRfis(openListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const myResolvedQuery = useMyRfis(resolvedListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const allOpenQuery = useAllRfis(openListParams, capabilitiesReady && canAccessPage && portfolioMode);
  const allResolvedQuery = useAllRfis(resolvedListParams, capabilitiesReady && canAccessPage && portfolioMode);

  const openQuery = portfolioMode ? allOpenQuery : myOpenQuery;
  const resolvedQuery = portfolioMode ? allResolvedQuery : myResolvedQuery;
  const rfisQuery = activeTab === 'active' ? openQuery : resolvedQuery;

  const myProjectsQuery = useMyRfiProjects(
    capabilitiesReady && !portfolioMode && canCreate,
  );
  const allProjectsQuery = useAllProjects(
    {},
    capabilitiesReady && portfolioMode,
  );

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

  const columns: ColumnsType<Rfi> = useMemo(
    () => [
      {
        title: 'RFI #',
        dataIndex: 'rfiNumber',
        key: 'rfiNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            style={{ color: tokens.colorTeal600 }}
            onClick={() =>
              setSelected({ projectId: record.projectId, rfiId: record.id })
            }
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
        render: (value: RfiSource | null) =>
          value ? (RFI_SOURCE_LABELS[value] ?? value) : '-',
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
        key: 'assignedTo',
        render: (_: unknown, record: Rfi) =>
          record.assignedToName ?? record.assignedTo ?? '-',
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Rfi) =>
          record.projectCode?.trim() || '-',
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record: Rfi) =>
          record.linkedDesignPackage?.fullCode ?? '-',
      },
      {
        title: 'Due date',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record: Rfi) => (
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
        render: (_: unknown, record: Rfi) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${record.projectId}/rfis/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [router],
  );

  if (!capabilitiesReady || (rfisQuery.isLoading && !rfisQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to view RFIs."
      />
    );
  }

  const apiUnavailable =
    rfisQuery.isError &&
    rfisQuery.error instanceof ApiRequestError &&
    (rfisQuery.error.status === 404 || rfisQuery.error.status === 0);

  const rows = rfisQuery.data?.data ?? [];
  const meta = rfisQuery.data?.meta;
  const openCount = openQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void openQuery.refetch();
    void resolvedQuery.refetch();
  };

  return (
    <>
      <FormLayout
        title="RFIs"
        description={
          portfolioMode
            ? 'All RFIs across projects.'
            : 'Requests for information assigned to or raised by you.'
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              Raise RFI
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="RFI APIs are not connected yet."
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
            placeholder="Search by title or RFI number"
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
          active={rfisQuery.isFetching && Boolean(rfisQuery.data)}
        />

        <DataTable<Rfi>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({ projectId: record.projectId, rfiId: record.id }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FileText />}
                title="No RFIs found"
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'Raise RFI',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <RfiFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          refetchLists();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <RfiDetailDrawer
          projectId={selected.projectId}
          rfiId={selected.rfiId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      ) : null}
    </>
  );
}
