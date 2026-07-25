// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
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
import {
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import SubmittalPackageDrawer from '@/components/modules/projects/submittals/SubmittalPackageDrawer';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import { formatSubmittalItemCodesSummary } from '@/lib/utils/submittal-display';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import {
  EXTERNAL_RELEASE_ACTIVE_STATUSES,
  EXTERNAL_RELEASE_ISSUED_STATUSES,
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

  const activeReleasesQuery = useSubmittals(
    projectId,
    {
      ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: EXTERNAL_RELEASE_ACTIVE_STATUSES,
    },
    !permLoading && lens.canViewSubmittals,
  );

  const issuedReleasesQuery = useSubmittals(
    projectId,
    {
      ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: EXTERNAL_RELEASE_ISSUED_STATUSES,
    },
    !permLoading && lens.canViewSubmittals,
  );

  const submittalsQuery = activeTab === 'active' ? activeReleasesQuery : issuedReleasesQuery;
  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;
  const activeCount = activeReleasesQuery.data?.meta?.total ?? 0;
  const issuedCount = issuedReleasesQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void activeReleasesQuery.refetch();
    void issuedReleasesQuery.refetch();
  };

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
          record.submittedByName ?? record.submittedBy ?? '—',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={status === 'DRAFT' ? 'Draft' : 'Issued'}
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
    ],
    [],
  );

  if (permLoading || submittalsQuery.isLoading || projectQuery.isLoading) {
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
          activeLabel="Active"
          closedLabel="Issued"
          activeCount={activeCount}
          closedCount={issuedCount}
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

        <DataTable<Submittal>
          rowKey="id"
          columns={columns}
          dataSource={submittals}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Send />}
                title="No external releases"
                description="Issue approved subtasks to site engineers or consultants"
                action={
                  canCreateRelease && !apiUnavailable
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
        onCreated={() => refetchLists()}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => refetchLists()}
      />
    </>
  );
}
