'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ClipboardCheck } from 'lucide-react';
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
import type {
  PunchItem,
  PunchItemSeverity,
  PunchItemStatus,
} from '@/lib/api/project-management.types';
import { useAllPunchItems } from '@/lib/query/punch-items';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatPunchCategory,
  formatPunchItemStatus,
  punchItemSeverityVariant,
  punchItemStatusVariant,
} from '@/lib/utils/pm-status-display';
import {
  PUNCH_CLOSED_STATUSES,
  PUNCH_OPEN_STATUSES,
  PUNCH_VERIFIED_STATUSES,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import { PunchItemFormDrawer } from '@/components/modules/projects/punch-items/PunchItemsPageContent';
import PunchItemDetailDrawer from '@/components/modules/projects/punch-items/PunchItemDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import {
  useCanViewPunchList,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';

const SEVERITY_OPTIONS: Array<{ value: PunchItemSeverity; label: string }> = [
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
];

/**
 * Global Punch List - cross-project portfolio list for D.Lead / PM / PA / SA.
 */
export default function GlobalPunchListPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<
    PunchItemSeverity | undefined
  >();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    punchItemId: string;
  } | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() && pm.projects.canView);
  const canViewPersonal = useCanViewPunchList();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    pm.punchItems.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    severity: severityFilter,
    category: categoryFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const openListParams = {
    ...(activeTab === 'active'
      ? params
      : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(PUNCH_OPEN_STATUSES, undefined),
  };
  const verifiedListParams = {
    ...(activeTab === 'withdrawn'
      ? params
      : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(PUNCH_VERIFIED_STATUSES, undefined),
  };
  const closedListParams = {
    ...(activeTab === 'closed'
      ? params
      : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(PUNCH_CLOSED_STATUSES, undefined),
  };

  const openQuery = useAllPunchItems(
    openListParams,
    capabilitiesReady && canAccessPage,
  );
  const verifiedQuery = useAllPunchItems(
    verifiedListParams,
    capabilitiesReady && canAccessPage,
  );
  const closedQuery = useAllPunchItems(
    closedListParams,
    capabilitiesReady && canAccessPage,
  );

  const punchQuery =
    activeTab === 'active'
      ? openQuery
      : activeTab === 'withdrawn'
        ? verifiedQuery
        : closedQuery;

  const openCount = openQuery.data?.meta.total ?? 0;
  const verifiedCount = verifiedQuery.data?.meta.total ?? 0;
  const closedCount = closedQuery.data?.meta.total ?? 0;

  const allProjectsQuery = useAllProjects(
    {},
    capabilitiesReady && portfolioMode,
  );

  const projectFilterOptions = useMemo(
    () =>
      (allProjectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [allProjectsQuery.data?.data],
  );

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
            onClick={(event) => {
              event.stopPropagation();
              router.push(
                `/projects/${record.projectId}/punch-list/${record.id}`,
              );
            }}
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
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={(event) => {
              event.stopPropagation();
              router.push(
                `/projects/${record.projectId}/punch-list/${record.id}`,
              );
            }}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
        render: (value: string | null) =>
          value ? formatPunchCategory(value) : '-',
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
        title: 'Area',
        dataIndex: 'roomOrArea',
        key: 'roomOrArea',
        ellipsis: true,
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Assigned To',
        key: 'assignedTo',
        render: (_: unknown, record: PunchItem) =>
          resolveUserDisplay(record.assignedTo, record.assignedToName, '-'),
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null) => formatProjectDate(value),
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
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: PunchItem) =>
          record.projectCode
            ? `${record.projectCode}${record.projectName ? ` - ${record.projectName}` : ''}`
            : '-',
      },
    ],
    [resolveUserDisplay, router],
  );

  if (!capabilitiesReady || (punchQuery.isLoading && !punchQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <FormLayout title="Punch List" description="Cross-project punch items.">
        <Alert
          type="warning"
          showIcon
          title="You do not have access to the global punch list."
        />
      </FormLayout>
    );
  }

  const rows = punchQuery.data?.data ?? [];
  const meta = punchQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Punch List"
        description="Walkthrough defects across projects - open, verified, and closed."
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              New punch item
            </Button>
          ) : undefined
        }
      >
        {punchQuery.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load punch list"
            description={
              punchQuery.error instanceof ApiRequestError
                ? punchQuery.error.message
                : 'Please try again.'
            }
          />
        )}

        <ListStatusTabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            resetPage();
          }}
          activeLabel="Open"
          closedLabel="Closed"
          thirdLabel="Verified"
          thirdTabPosition="middle"
          activeCount={openCount}
          closedCount={closedCount}
          thirdCount={verifiedCount}
        />

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
            placeholder="Severity"
            className={layout.filterControl}
            value={severityFilter}
            onChange={(value: PunchItemSeverity | undefined) => {
              resetPage();
              setSeverityFilter(value);
            }}
            options={SEVERITY_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Category"
            className={layout.filterControl}
            value={categoryFilter}
            onChange={(value: string | undefined) => {
              resetPage();
              setCategoryFilter(value);
            }}
            options={CATEGORY_OPTIONS}
          />
          {portfolioMode && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Project"
              className={layout.filterControl}
              value={projectFilter}
              onChange={(value: string | undefined) => {
                resetPage();
                setProjectFilter(value);
              }}
              options={projectFilterOptions}
              loading={allProjectsQuery.isLoading}
            />
          )}
        </Space>

        <TableUpdatingIndicator
          active={punchQuery.isFetching && Boolean(punchQuery.data)}
        />

        <DataTable<PunchItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({
                projectId: record.projectId,
                punchItemId: record.id,
              }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ClipboardCheck />}
                title="No punch items"
                description="Record walkthrough defects and track correction to closeout"
                action={
                  canCreate
                    ? {
                        label: 'New punch item',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <PunchItemFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={(created) => {
          void openQuery.refetch();
          void verifiedQuery.refetch();
          void closedQuery.refetch();
          setSelected({
            projectId: created.projectId,
            punchItemId: created.id,
          });
        }}
      />

      <PunchItemDetailDrawer
        projectId={selected?.projectId ?? ''}
        punchItemId={selected?.punchItemId ?? null}
        onClose={() => setSelected(null)}
        onUpdated={() => {
          void openQuery.refetch();
          void verifiedQuery.refetch();
          void closedQuery.refetch();
        }}
      />
    </>
  );
}
