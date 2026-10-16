'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { layout } from '@/lib/theme/layout';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
  SubmittalPurpose,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { useSubmittals } from '@/lib/query/submittals';
import { useProject } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import { submittalStatusVariant } from '@/lib/utils/pm-status-display';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import SubmittalPackageDrawer from '@/components/modules/projects/submittals/SubmittalPackageDrawer';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import { formatExternalReleaseStatus } from '@/lib/utils/external-release-status';
import { formatSubmittalItemCodesSummary } from '@/lib/utils/submittal-display';
import {
  EXTERNAL_RELEASE_DRAFT_STATUSES,
  EXTERNAL_RELEASE_ISSUED_STATUSES,
  EXTERNAL_RELEASE_WITHDRAWN_STATUSES,
} from '@/lib/utils/list-status-tabs';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';

const EXTERNAL_PURPOSES: SubmittalPurpose[] = [
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
];

export default function ExternalReleasePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<
    SubmittalPurpose | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(
    null,
  );
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const projectQuery = useProject(projectId, !permLoading);

  const filterParams = {
    search: search.trim() || undefined,
    submittalPurpose: purposeFilter ?? EXTERNAL_PURPOSES.join(','),
  };

  const draftListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: EXTERNAL_RELEASE_DRAFT_STATUSES,
  };
  const issuedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: EXTERNAL_RELEASE_ISSUED_STATUSES,
  };
  const withdrawnListParams = {
    ...(activeTab === 'withdrawn' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: EXTERNAL_RELEASE_WITHDRAWN_STATUSES,
  };

  const draftQuery = useSubmittals(
    projectId,
    draftListParams,
    !permLoading && lens.canViewSubmittals,
  );
  const issuedQuery = useSubmittals(
    projectId,
    issuedListParams,
    !permLoading && lens.canViewSubmittals,
  );
  const withdrawnQuery = useSubmittals(
    projectId,
    withdrawnListParams,
    !permLoading && lens.canViewSubmittals,
  );

  const submittalsQuery =
    activeTab === 'active'
      ? draftQuery
      : activeTab === 'closed'
        ? issuedQuery
        : withdrawnQuery;

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;
  const draftCount = draftQuery.data?.meta.total;
  const issuedCount = issuedQuery.data?.meta.total;
  const withdrawnCount = withdrawnQuery.data?.meta.total;

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: 'Release #',
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
        title: 'Recipient',
        dataIndex: 'submittalPurpose',
        key: 'submittalPurpose',
        render: (value: SubmittalPurpose | null) =>
          formatExternalReleasePurpose(value),
      },
      {
        title: 'Issued by',
        key: 'issuedBy',
        render: (_value: unknown, record) =>
          record.submittedByName ?? record.submittedBy ?? '-',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={formatExternalReleaseStatus(status)}
            variant={submittalStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Issued date',
        dataIndex: 'issuedAt',
        key: 'issuedAt',
        render: (value: string | null) => formatProjectDate(value),
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
              router.push(`/projects/${projectId}/external-releases/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [projectId, router],
  );

  if (
    permLoading ||
    (submittalsQuery.isLoading && !submittalsQuery.data) ||
    projectQuery.isLoading
  ) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewSubmittals) {
    return null;
  }

  const isTenderStage = projectQuery.data?.designStage === 'TENDER';
  const canCreateRelease = lens.canCreateSubmittals && !isTenderStage;

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  return (
    <>
      <FormLayout
        title="External release"
        description="External releases you created or that belong to disciplines you lead."
        extra={
          canCreateRelease ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New external release
            </Button>
          ) : undefined
        }
      >
        {isTenderStage && (
          <Alert
            type="warning"
            showIcon
            className="!mb-4"
            title="This project is in Tender stage. External releases cannot be created until the project moves to an active design phase."
          />
        )}

        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Discipline leader workflow"
          description="Only approved and locked subtasks can be issued externally. Select subtasks prepared by the discipline lead and issue them to site engineers or consultants."
        />

        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="External release APIs are not connected yet."
          />
        )}

        <ListStatusTabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            resetPage();
          }}
          activeLabel="In Progress"
          closedLabel="Issued"
          thirdLabel="Withdrawn"
          activeCount={draftCount}
          closedCount={issuedCount}
          thirdCount={withdrawnCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search releases"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Recipient"
            className={layout.filterControl}
            value={purposeFilter}
            onChange={(value: SubmittalPurpose | undefined) => {
              resetPage();
              setPurposeFilter(value);
            }}
            options={[
              {
                value: 'DISCIPLINE_SITE',
                label: formatExternalReleasePurpose('DISCIPLINE_SITE'),
              },
              {
                value: 'DISCIPLINE_CONSULTANT',
                label: formatExternalReleasePurpose('DISCIPLINE_CONSULTANT'),
              },
            ]}
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
                title="No external releases"
                description={
                  activeTab === 'active'
                    ? 'Draft releases appear here before they are issued.'
                    : activeTab === 'withdrawn'
                      ? 'Withdrawn releases appear here.'
                      : 'Issue approved subtasks to site engineers or consultants'
                }
                action={
                  canCreateRelease && !apiUnavailable && activeTab === 'active'
                    ? {
                        label: 'New external release',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <SubmittalPackageDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void draftQuery.refetch();
          void issuedQuery.refetch();
        }}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => {
          void draftQuery.refetch();
          void issuedQuery.refetch();
          void withdrawnQuery.refetch();
        }}
      />
    </>
  );
}
