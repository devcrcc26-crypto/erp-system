'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { GitBranch } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
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

const STATUS_OPTIONS: Array<{ value: ChangeRequestStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CLOSED', label: 'Closed' },
];

/**
 * Global change requests list — cross-project, current-user relevant only.
 */
export default function GlobalChangeRequestsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
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
    useGlobalPortfolioListMode() &&
    (pm.change_requests.canView || epc.navFullAccess) &&
    !epc.navDesigner &&
    !epc.navDisciplineLeader;
  const canViewPersonal = useCanViewChangeRequests();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.change_requests.canCreate;

  const listParams = {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const myChangeRequestsQuery = useMyChangeRequests(
    listParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allChangeRequestsQuery = useAllChangeRequests(
    listParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const changeRequestsQuery = portfolioMode
    ? allChangeRequestsQuery
    : myChangeRequestsQuery;

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
        render: (_: unknown, record: ProjectChangeRequest) => {
          const code = record.projectCode?.trim();
          const name = record.projectName?.trim();
          if (code && name) {
            return `${code} — ${name}`;
          }
          return name || code || '-';
        },
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
    ],
    [],
  );

  if (!capabilitiesReady || changeRequestsQuery.isLoading) {
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
            description="This page is ready — data will appear when the backend is available."
          />
        )}

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
            options={STATUS_OPTIONS}
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
          void changeRequestsQuery.refetch();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <ChangeRequestDrawer
          projectId={selected.projectId}
          changeRequestId={selected.changeRequestId}
          onClose={() => setSelected(null)}
          onUpdated={() => void changeRequestsQuery.refetch()}
        />
      ) : null}
    </>
  );
}
