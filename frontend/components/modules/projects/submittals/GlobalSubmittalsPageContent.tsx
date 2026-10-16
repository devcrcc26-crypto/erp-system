'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { useMySubmittals, useAllSubmittals } from '@/lib/query/submittals';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  isOverdue,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import { formatSubmittalItemCodesSummary } from '@/lib/utils/submittal-display';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import {
  CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES,
  CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import ConstructionSubmittalDrawer from '@/components/modules/projects/submittals/ConstructionSubmittalDrawer';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewSubmittals,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Global construction submittals list - cross-project, current-user relevant only.
 */
export default function GlobalSubmittalsPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [selected, setSelected] = useState<{
    projectId: string;
    submittalId: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.submittals.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewSubmittals();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess || epc.navDisciplineLeader || epc.navDesigner;
  const resolveUserDisplay = useUserDisplayResolver();

  const filterParams = {
    search: search.trim() || undefined,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const activeListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const completedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myActiveQuery = useMySubmittals(activeListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const myCompletedQuery = useMySubmittals(completedListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const allActiveQuery = useAllSubmittals(activeListParams, capabilitiesReady && canAccessPage && portfolioMode);
  const allCompletedQuery = useAllSubmittals(completedListParams, capabilitiesReady && canAccessPage && portfolioMode);

  const activeQuery = portfolioMode ? allActiveQuery : myActiveQuery;
  const completedQuery = portfolioMode ? allCompletedQuery : myCompletedQuery;
  const submittalsQuery = activeTab === 'active' ? activeQuery : completedQuery;

  const projectsQuery = useAllProjects(
    {},
    capabilitiesReady && portfolioMode,
  );
  const projectFilterOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.projectCode} - ${project.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: t('pages.globalSubmittals.projectName'),
        key: 'project',
        render: (_: unknown, record: Submittal) =>
          record.projectCode?.trim() || '-',
      },
      {
        title: 'Submittal #',
        dataIndex: 'submittalNumber',
        key: 'submittalNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() =>
              setSelected({
                projectId: record.projectId,
                submittalId: record.id,
              })
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
        title: 'Subtasks',
        key: 'subtasks',
        render: (_value: unknown, record) =>
          formatSubmittalItemCodesSummary(record.items),
      },
      {
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
      },
      {
        title: 'Rev',
        dataIndex: 'revisionNumber',
        key: 'revisionNumber',
        align: 'right',
        width: 64,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={formatSubmittalStatus(status)}
            variant={submittalStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Assigned to',
        dataIndex: 'assignedTo',
        key: 'assignedTo',
        render: (_: unknown, record: Submittal) =>
          resolveUserDisplay(record.assignedTo, record.assignedToName, '-'),
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span
            className={
              isOverdue(value) &&
              record.status !== 'APPROVED' &&
              record.status !== 'REJECTED'
                ? 'font-medium text-red-600'
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
        render: (_: unknown, record: Submittal) => (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${record.projectId}/submittals/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay, router, t],
  );

  if (!capabilitiesReady || (submittalsQuery.isLoading && !submittalsQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalSubmittals.noAccess')}
      />
    );
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;
  const activeCount = activeQuery.data?.meta?.total ?? 0;
  const completedCount = completedQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activeQuery.refetch();
    void completedQuery.refetch();
  };

  return (
    <>
      <FormLayout
        title={t('pages.globalSubmittals.title')}
        description={
          portfolioMode
            ? 'All construction submittals across projects.'
            : t('pages.globalSubmittals.description')
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDrawerOpen(true)}
              disabled={apiUnavailable}
            >
              New submittal
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
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
          activeLabel="Active"
          closedLabel="Completed"
          activeCount={activeCount}
          closedCount={completedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search submittals"
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
            onChange={(value: SubmittalStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(
                    CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES,
                    formatSubmittalStatus,
                  )
                : buildTabStatusFilterOptions(
                    CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES,
                    formatSubmittalStatus,
                  )
            }
          />
          {portfolioMode ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className={layout.filterControl}
              value={projectFilter}
              optionFilterProp="label"
              loading={projectsQuery.isLoading}
              onChange={(value: string | undefined) => {
                resetPage();
                setProjectFilter(value);
              }}
              options={projectFilterOptions}
            />
          ) : null}
        </Space>

        <TableUpdatingIndicator
          active={submittalsQuery.isFetching && Boolean(submittalsQuery.data)}
        />

        <DataTable<Submittal>
          rowKey="id"
          columns={columns}
          dataSource={submittals}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Send />}
                title={t('pages.globalSubmittals.empty')}
                description={
                  portfolioMode
                    ? 'Construction submittals from all projects appear here.'
                    : 'Submittals assigned to you, raised by you, or in your disciplines appear here.'
                }
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'New submittal',
                        onClick: () => setDrawerOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <ConstructionSubmittalDrawer
        open={drawerOpen}
        showProjectSelector
        onClose={() => setDrawerOpen(false)}
        onCreated={(submittalId) => {
          refetchLists();
          void activeQuery.refetch().then((result) => {
            const created = result.data?.data.find((s) => s.id === submittalId);
            if (created) {
              setSelected({
                projectId: created.projectId,
                submittalId: created.id,
              });
            }
          });
          setDrawerOpen(false);
        }}
      />

      {selected && (
        <SubmittalDetailDrawer
          projectId={selected.projectId}
          submittalId={selected.submittalId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      )}
    </>
  );
}
