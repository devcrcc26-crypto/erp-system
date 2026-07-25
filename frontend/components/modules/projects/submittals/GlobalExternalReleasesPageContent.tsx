'use client';

import { useMemo, useState } from 'react';
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
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
  SubmittalPurpose,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { useMySubmittals, useAllExternalReleases } from '@/lib/query/submittals';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import { submittalStatusVariant } from '@/lib/utils/pm-status-display';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import {
  EXTERNAL_RELEASE_DRAFT_STATUS_OPTIONS,
  EXTERNAL_RELEASE_ISSUED_STATUS_OPTIONS,
  formatExternalReleaseStatus,
} from '@/lib/utils/external-release-status';
import { formatSubmittalItemCodesSummary } from '@/lib/utils/submittal-display';
import {
  EXTERNAL_RELEASE_DRAFT_STATUSES,
  EXTERNAL_RELEASE_ISSUED_STATUSES,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import SubmittalPackageDrawer from '@/components/modules/projects/submittals/SubmittalPackageDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewExternalReleases,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const EXTERNAL_PURPOSES: SubmittalPurpose[] = [
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
];

/**
 * Global external releases list — cross-project, current-user relevant only.
 */
export default function GlobalExternalReleasesPageContent(): React.ReactNode {
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
  const canViewPersonal = useCanViewExternalReleases();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess || epc.navDisciplineLeader || epc.navDesigner;

  const filterParams = {
    search: search.trim() || undefined,
    projectId: portfolioMode ? projectFilter : undefined,
    submittalPurpose: portfolioMode ? undefined : EXTERNAL_PURPOSES.join(','),
  };

  const draftListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      EXTERNAL_RELEASE_DRAFT_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const issuedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      EXTERNAL_RELEASE_ISSUED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myDraftQuery = useMySubmittals(
    draftListParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const myIssuedQuery = useMySubmittals(
    issuedListParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allDraftQuery = useAllExternalReleases(
    draftListParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const allIssuedQuery = useAllExternalReleases(
    issuedListParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );

  const draftQuery = portfolioMode ? allDraftQuery : myDraftQuery;
  const issuedQuery = portfolioMode ? allIssuedQuery : myIssuedQuery;
  const submittalsQuery = activeTab === 'active' ? draftQuery : issuedQuery;

  const projectsQuery = useAllProjects(
    {},
    capabilitiesReady && portfolioMode,
  );
  const projectFilterOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.projectCode} — ${project.name}`,
      })),
    [projectsQuery.data?.data],
  );

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
        title: 'Recipient',
        dataIndex: 'submittalPurpose',
        key: 'submittalPurpose',
        render: (value: SubmittalPurpose | null) =>
          formatExternalReleasePurpose(value),
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
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Submittal) =>
          record.projectCode?.trim() || '-',
      },
    ],
    [],
  );

  if (!capabilitiesReady || (submittalsQuery.isLoading && !submittalsQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalExternalReleases.noAccess')}
      />
    );
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;
  const draftCount = draftQuery.data?.meta.total;
  const issuedCount = issuedQuery.data?.meta.total;

  return (
    <>
      <FormLayout
        title={t('pages.globalExternalReleases.title')}
        description={
          portfolioMode
            ? 'All external releases across projects.'
            : t('pages.globalExternalReleases.description')
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDrawerOpen(true)}
              disabled={apiUnavailable}
            >
              New external release
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="External release APIs are not connected yet."
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
          activeLabel="Draft"
          closedLabel="Issued"
          activeCount={draftCount}
          closedCount={issuedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search external releases"
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
                ? EXTERNAL_RELEASE_DRAFT_STATUS_OPTIONS
                : EXTERNAL_RELEASE_ISSUED_STATUS_OPTIONS
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
                title={t('pages.globalExternalReleases.empty')}
                description={
                  activeTab === 'active'
                    ? 'Draft external releases appear here.'
                    : portfolioMode
                      ? 'Issued external releases from all projects appear here.'
                      : 'Issued external releases you created, or that belong to disciplines you lead, appear here.'
                }
                action={
                  canCreate && !apiUnavailable && activeTab === 'active'
                    ? {
                        label: 'New external release',
                        onClick: () => setDrawerOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <SubmittalPackageDrawer
        open={drawerOpen}
        showProjectSelector
        onClose={() => setDrawerOpen(false)}
        onCreated={(submittalId) => {
          void draftQuery.refetch().then((result) => {
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
          onUpdated={() => {
            void draftQuery.refetch();
            void issuedQuery.refetch();
          }}
        />
      )}
    </>
  );
}
