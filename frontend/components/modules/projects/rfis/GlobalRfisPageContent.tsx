'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FileText } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
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

const STATUS_OPTIONS: Array<{ value: RfiStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'ANSWERED', label: 'Answered' },
  { value: 'CLOSED', label: 'Closed' },
];

/**
 * Global RFIs list — cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalRfisPageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
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
    useGlobalPortfolioListMode() &&
    pm.rfis.canView &&
    !epc.navDesigner &&
    !epc.navDisciplineLeader;
  const canViewPersonal = useCanViewRfis();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.rfis.canCreate;

  const listParams = {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    priority: priorityFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const myRfisQuery = useMyRfis(
    listParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allRfisQuery = useAllRfis(
    listParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const rfisQuery = portfolioMode ? allRfisQuery : myRfisQuery;

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
            label: `${p.projectCode} — ${p.name}`,
          }))
        : (myProjectsQuery.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} — ${p.name}`,
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
          value ? (RFI_SOURCE_LABELS[value] ?? value) : '—',
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
          record.assignedToName ?? record.assignedTo ?? '—',
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Rfi) => {
          const code = record.projectCode?.trim();
          const name = record.projectName?.trim();
          if (code && name) return `${code} — ${name}`;
          return name ?? code ?? '—';
        },
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record: Rfi) =>
          record.linkedDesignPackage?.fullCode ?? '—',
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
    ],
    [],
  );

  if (!capabilitiesReady || rfisQuery.isLoading) {
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
            description="This page is ready — data will appear when the backend is available."
          />
        )}

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
            options={STATUS_OPTIONS}
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
          void rfisQuery.refetch();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <RfiDetailDrawer
          projectId={selected.projectId}
          rfiId={selected.rfiId}
          onClose={() => setSelected(null)}
          onUpdated={() => void rfisQuery.refetch()}
        />
      ) : null}
    </>
  );
}
