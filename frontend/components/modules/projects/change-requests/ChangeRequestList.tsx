// Gap completion - new

'use client';

import { useMemo, useState } from 'react';
import { Button, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import type {
  ChangeRequestStatus,
  ProjectChangeRequest,
} from '@/lib/api/project-management.types';
import { usePmCapabilities, usePermissionsLoading, useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useChangeRequests, useEligibleCrSubtasks } from '@/lib/query/change-requests';
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
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { useAuthStore } from '@/stores/auth.store';

export default function ChangeRequestList({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const router = useRouter();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const permLoading = usePermissionsLoading();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    ChangeRequestStatus | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eligibleQuery = useEligibleCrSubtasks(
    projectId,
    !permLoading && pm.projects.canView,
  );
  const canCreateCr =
    pm.projects.canCreate ||
    isSystemAdministrator ||
    epc.navFullAccess ||
    (eligibleQuery.data?.length ?? 0) > 0;

  const filterParams = {
    search: search.trim() || undefined,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  const activeListQuery = useChangeRequests(
    projectId,
    {
      ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CHANGE_REQUEST_ACTIVE_STATUSES,
        activeTab === 'active' ? statusFilter : undefined,
      ),
    },
    !permLoading && pm.projects.canView,
  );

  const resolvedListQuery = useChangeRequests(
    projectId,
    {
      ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CHANGE_REQUEST_RESOLVED_STATUSES,
        activeTab === 'closed' ? statusFilter : undefined,
      ),
    },
    !permLoading && pm.projects.canView,
  );

  const listQuery = activeTab === 'active' ? activeListQuery : resolvedListQuery;
  const activeCount = activeListQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedListQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activeListQuery.refetch();
    void resolvedListQuery.refetch();
  };

  const columns: ColumnsType<ProjectChangeRequest> = useMemo(
    () => [
      {
        title: 'CR Number',
        dataIndex: 'changeNumber',
        key: 'changeNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0 font-mono text-[12px]"
            style={{ color: tokens.colorTeal600 }}
            onClick={() => setSelectedId(record.id)}
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
              router.push(`/projects/${projectId}/change-requests/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [projectId, router],
  );

  if (permLoading || (listQuery.isLoading && !listQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!pm.projects.canView) {
    return null;
  }

  return (
    <ProjectModuleGate projectId={projectId} module="change_requests">
    <>
      <FormLayout
        title="Change requests"
        description="Track scope changes from identification through approval."
          extra={
          canCreateCr ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              New change request
            </Button>
          ) : undefined
        }
      >
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
            placeholder="Search change requests"
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
        </Space>

        <TableUpdatingIndicator
          active={listQuery.isFetching && Boolean(listQuery.data)}
        />

        <DataTable<ProjectChangeRequest>
          rowKey="id"
          columns={columns}
          dataSource={listQuery.data?.data ?? []}
          loading={listQuery.isLoading && !listQuery.data}
          pagination={bindMeta(listQuery.data?.meta)}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: listQuery.isLoading ? (
              <Table
                pagination={false}
                showHeader={false}
                rowKey={(row) => String(row)}
                dataSource={[1, 2, 3]}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    key: 'skeleton',
                    render: () => (
                      <div className="erp-page-skeleton h-10 w-full rounded" />
                    ),
                  },
                ]}
              />
            ) : (
              <TableEmptyState
                icon={<GitBranch />}
                title="No change requests yet"
                description="Create a change request to track scope impacts"
                action={
                  canCreateCr
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
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => refetchLists()}
      />

      <ChangeRequestDrawer
        projectId={projectId}
        changeRequestId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => refetchLists()}
      />
    </>
    </ProjectModuleGate>
  );
}
