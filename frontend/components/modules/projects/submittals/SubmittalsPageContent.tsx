// UI polish pass - styles only, no logic changes

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
import { useSubmittals } from '@/lib/query/submittals';
import { useProject } from '@/lib/query/projects';
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
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import Link from 'next/link';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

export default function SubmittalsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(
    null,
  );
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const projectQuery = useProject(projectId, !permLoading);
  const resolveUserDisplay = useUserDisplayResolver();
  const canAccessPage = lens.canViewSubmittals;

  const filterParams = {
    search: search.trim() || undefined,
    submittalPurpose: 'IN_CONSTRUCTION',
  };

  const activeSubmittalsQuery = useSubmittals(
    projectId,
    {
      ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CONSTRUCTION_SUBMITTAL_ACTIVE_STATUSES,
        activeTab === 'active' ? statusFilter : undefined,
      ),
    },
    !permLoading && canAccessPage,
  );

  const completedSubmittalsQuery = useSubmittals(
    projectId,
    {
      ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CONSTRUCTION_SUBMITTAL_COMPLETED_STATUSES,
        activeTab === 'closed' ? statusFilter : undefined,
      ),
    },
    !permLoading && canAccessPage,
  );

  const submittalsQuery = activeTab === 'active' ? activeSubmittalsQuery : completedSubmittalsQuery;

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: 'Submittal #',
        dataIndex: 'submittalNumber',
        key: 'submittalNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedSubmittalId(record.id)}
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
        title: 'Contractor',
        dataIndex: 'contractor',
        key: 'contractor',
        render: (value: string | null) => value ?? '-',
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
              router.push(`/projects/${projectId}/submittals/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [projectId, resolveUserDisplay, router],
  );

  if (
    permLoading ||
    (submittalsQuery.isLoading && !submittalsQuery.data) ||
    projectQuery.isLoading
  ) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return null;
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;
  const isTenderStage = projectQuery.data?.designStage === 'TENDER';
  const canCreateSubmittal = lens.canCreateSubmittals && !isTenderStage;
  const activeCount = activeSubmittalsQuery.data?.meta?.total ?? 0;
  const completedCount = completedSubmittalsQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activeSubmittalsQuery.refetch();
    void completedSubmittalsQuery.refetch();
  };

  return (
    <ProjectModuleGate projectId={projectId} module="submittals">
    <>
      <FormLayout
        title="Construction submittals"
        description="Material approvals, shop drawings, and product data submitted to discipline leaders before purchase or installation."
        extra={
          <Space>
            <Link href={`/projects/${projectId}/submittals/external-release`}>
              <Button>External release</Button>
            </Link>
            {canCreateSubmittal && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
                disabled={apiUnavailable}
              >
                New submittal
              </Button>
            )}
          </Space>
        }
      >
        {isTenderStage && (
          <Alert
            type="warning"
            showIcon
            className="!mb-4"
            title="This project is in Tender stage. Submittals cannot be created until the project moves to an active design phase."
          />
        )}

        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
            description="This page is ready - data will appear when the project management backend module is available."
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
        </Space>

        <TableUpdatingIndicator
          active={submittalsQuery.isFetching && Boolean(submittalsQuery.data)}
        />

        <DataTable<Submittal>
          rowKey="id"
          columns={columns}
          dataSource={submittals}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedSubmittalId(record.id),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Send />}
                title="No construction submittals"
                description="Create a submittal with subtasks and documents for discipline leader approval"
                action={
                  canCreateSubmittal && !apiUnavailable
                    ? {
                        label: 'New submittal',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <ConstructionSubmittalDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={(submittalId) => {
          refetchLists();
          setSelectedSubmittalId(submittalId);
        }}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => refetchLists()}
      />
    </>
    </ProjectModuleGate>
  );
}
