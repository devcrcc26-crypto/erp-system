'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  ChangeRequestStatus,
  ProjectChangeRequest,
} from '@/lib/api/project-management.types';
import { useMyChangeRequests, useAllChangeRequests } from '@/lib/query/change-requests';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  changeRequestStatusVariant,
  formatChangeRequestStatus,
} from '@/lib/utils/pm-status-display';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import {
  CHANGE_REQUEST_ACTIVE_STATUSES,
  CHANGE_REQUEST_RESOLVED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewChangeRequests,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Global change requests list - cross-project, current-user relevant only.
 */
export default function GlobalChangeRequestsPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    ChangeRequestStatus | undefined
  >();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [selected, setSelected] = useState<{
    projectId: string;
    changeRequestId: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.change_requests.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewChangeRequests();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.change_requests.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const activeListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      CHANGE_REQUEST_ACTIVE_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const resolvedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      CHANGE_REQUEST_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myActiveQuery = useMyChangeRequests(activeListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const myResolvedQuery = useMyChangeRequests(resolvedListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const allActiveQuery = useAllChangeRequests(activeListParams, capabilitiesReady && canAccessPage && portfolioMode);
  const allResolvedQuery = useAllChangeRequests(resolvedListParams, capabilitiesReady && canAccessPage && portfolioMode);

  const activeQuery = portfolioMode ? allActiveQuery : myActiveQuery;
  const resolvedQuery = portfolioMode ? allResolvedQuery : myResolvedQuery;
  const changeRequestsQuery = activeTab === 'active' ? activeQuery : resolvedQuery;

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

  const columns: ColumnsType<ProjectChangeRequest> = useMemo(
    () => [
      {
        title: 'CR Number',
        dataIndex: 'changeNumber',
        key: 'changeNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() =>
              setSelected({
                projectId: record.projectId,
                changeRequestId: record.id,
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
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: ChangeRequestStatus) => (
          <StatusBadge
            label={formatChangeRequestStatus(status)}
            variant={changeRequestStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: ProjectChangeRequest) =>
          record.projectCode?.trim() || '-',
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record: ProjectChangeRequest) =>
          record.linkedDesignPackage?.packageCode ?? '-',
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: '',
        key: 'open',
        width: 70,
        render: (_: unknown, record: ProjectChangeRequest) => (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(
                `/projects/${record.projectId}/change-requests/${record.id}`,
              );
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [router],
  );

  if (
    !capabilitiesReady ||
    (changeRequestsQuery.isLoading && !changeRequestsQuery.data)
  ) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalChangeRequests.noAccess')}
      />
    );
  }

  const apiUnavailable =
    changeRequestsQuery.isError &&
    changeRequestsQuery.error instanceof ApiRequestError &&
    (changeRequestsQuery.error.status === 404 ||
      changeRequestsQuery.error.status === 0);

  const rows = changeRequestsQuery.data?.data ?? [];
  const meta = changeRequestsQuery.data?.meta;
  const activeCount = activeQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activeQuery.refetch();
    void resolvedQuery.refetch();
  };

  return (
    <>
      <FormLayout
        title={t('pages.globalChangeRequests.title')}
        description={
          portfolioMode
            ? 'All change requests across projects.'
            : t('pages.globalChangeRequests.description')
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New change request
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Change request APIs are not connected yet."
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
          closedLabel="Resolved"
          activeCount={activeCount}
          closedCount={resolvedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by title or CR number"
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
            onChange={(value: ChangeRequestStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(
                    CHANGE_REQUEST_ACTIVE_STATUSES,
                    formatChangeRequestStatus,
                  )
                : buildTabStatusFilterOptions(
                    CHANGE_REQUEST_RESOLVED_STATUSES,
                    formatChangeRequestStatus,
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
          active={
            changeRequestsQuery.isFetching && Boolean(changeRequestsQuery.data)
          }
        />

        <DataTable<ProjectChangeRequest>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({
                projectId: record.projectId,
                changeRequestId: record.id,
              }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<GitBranch />}
                title={t('pages.globalChangeRequests.empty')}
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'New change request',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <CreateChangeRequestDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          refetchLists();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <ChangeRequestDrawer
          projectId={selected.projectId}
          changeRequestId={selected.changeRequestId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      ) : null}
    </>
  );
}
