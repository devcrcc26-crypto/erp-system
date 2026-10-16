'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Mail } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Correspondence,
  CorrespondenceDirection,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@/lib/api/project-management.types';
import { useAllCorrespondence } from '@/lib/query/correspondence';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  correspondenceDirectionVariant,
  correspondenceStatusVariant,
  formatCorrespondenceDirection,
  formatCorrespondenceStatus,
} from '@/lib/utils/pm-status-display';
import {
  CORRESPONDENCE_ACTIVE_STATUSES,
  CORRESPONDENCE_CLOSED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import { CorrespondenceFormDrawer } from '@/components/modules/projects/correspondence/CorrespondencePageContent';
import CorrespondenceDetailDrawer from '@/components/modules/projects/correspondence/CorrespondenceDetailDrawer';
import {
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';

const TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'LETTER', label: 'Letter' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'INSTRUCTION', label: 'Instruction' },
  { value: 'MEMO', label: 'Memo' },
];

const DIRECTION_OPTIONS: { value: CorrespondenceDirection; label: string }[] = [
  { value: 'OUTGOING', label: 'Outgoing' },
  { value: 'INCOMING', label: 'Incoming' },
];

/**
 * Global Correspondence list - company-wide portfolio access only.
 */
export default function GlobalCorrespondencePageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CorrespondenceStatus | undefined>();
  const [directionFilter, setDirectionFilter] = useState<CorrespondenceDirection | undefined>();
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    correspondenceId: string;
  } | null>(null);
  const [responseState, setResponseState] = useState<{
    projectId: string;
    parentId: string;
    direction: CorrespondenceDirection;
  } | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode = pm.projects.canView || epc.navFullAccess;
  const canAccessPage = epc.navFullAccess;
  const canCreate = epc.navFullAccess || pm.correspondence.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    direction: directionFilter,
    correspondenceType: typeFilter,
  };

  const enabled = capabilitiesReady && canAccessPage && portfolioMode;

  const activeQuery = useAllCorrespondence(
    {
      ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CORRESPONDENCE_ACTIVE_STATUSES,
        activeTab === 'active' ? statusFilter : undefined,
      ),
    },
    enabled,
  );
  const closedQuery = useAllCorrespondence(
    {
      ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CORRESPONDENCE_CLOSED_STATUSES,
        activeTab === 'closed' ? statusFilter : undefined,
      ),
    },
    enabled,
  );

  const query = activeTab === 'active' ? activeQuery : closedQuery;

  const refetchLists = (): void => {
    void activeQuery.refetch();
    void closedQuery.refetch();
  };

  const columns: ColumnsType<Correspondence> = useMemo(
    () => [
      {
        title: 'Ref #',
        dataIndex: 'referenceNumber',
        key: 'referenceNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className={`!px-0 ${layout.traceabilityLinkClass}`}
            style={{ color: tokens.colorTeal600 }}
            onClick={(e) => {
              e.stopPropagation();
              setSelected({ projectId: record.projectId, correspondenceId: record.id });
            }}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Direction',
        dataIndex: 'direction',
        key: 'direction',
        render: (direction: CorrespondenceDirection) => (
          <StatusBadge
            label={formatCorrespondenceDirection(direction)}
            variant={correspondenceDirectionVariant(direction)}
          />
        ),
      },
      {
        title: 'Type',
        dataIndex: 'correspondenceType',
        key: 'correspondenceType',
        render: (value: string) => value.replace(/_/g, ' '),
      },
      {
        title: 'Subject',
        dataIndex: 'subject',
        key: 'subject',
        ellipsis: true,
      },
      {
        title: 'From',
        key: 'from',
        render: (_: unknown, record: Correspondence) =>
          record.senderCompany
            ? `${record.senderName} (${record.senderCompany})`
            : record.senderName,
      },
      {
        title: 'To',
        key: 'to',
        render: (_: unknown, record: Correspondence) =>
          record.recipientCompany
            ? `${record.recipientName} (${record.recipientCompany})`
            : record.recipientName,
      },
      {
        title: 'Date',
        dataIndex: 'correspondenceDate',
        key: 'correspondenceDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: CorrespondenceStatus) => (
          <StatusBadge
            label={formatCorrespondenceStatus(status)}
            variant={correspondenceStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Correspondence) =>
          record.projectCode?.trim() || '-',
      },
    ],
    [],
  );

  if (!capabilitiesReady) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="Correspondence is available to project managers and administrators."
      />
    );
  }

  if (query.isLoading && !query.data) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    query.isError &&
    query.error instanceof ApiRequestError &&
    (query.error.status === 404 || query.error.status === 0);

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const activeCount = activeQuery.data?.meta?.total ?? 0;
  const closedCount = closedQuery.data?.meta?.total ?? 0;

  return (
    <>
      <FormLayout
        title="Correspondence"
        description="All correspondence across projects."
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New correspondence
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Correspondence APIs are not connected yet."
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
          closedLabel="Closed"
          activeCount={activeCount}
          closedCount={closedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by reference or subject"
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
            onChange={(value: CorrespondenceStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(
                    CORRESPONDENCE_ACTIVE_STATUSES,
                    formatCorrespondenceStatus,
                  )
                : buildTabStatusFilterOptions(
                    CORRESPONDENCE_CLOSED_STATUSES,
                    formatCorrespondenceStatus,
                  )
            }
          />
          <Select
            allowClear
            placeholder="Direction"
            className={layout.filterControlXs}
            value={directionFilter}
            onChange={(value: CorrespondenceDirection | undefined) => {
              resetPage();
              setDirectionFilter(value);
            }}
            options={DIRECTION_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Type"
            className={layout.filterControlXs}
            value={typeFilter}
            onChange={(value: CorrespondenceType | undefined) => {
              resetPage();
              setTypeFilter(value);
            }}
            options={TYPE_OPTIONS}
          />
        </Space>

        <TableUpdatingIndicator active={query.isFetching && Boolean(query.data)} />

        <DataTable<Correspondence>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({ projectId: record.projectId, correspondenceId: record.id }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Mail />}
                title="No correspondence found"
                action={
                  canCreate && !apiUnavailable
                    ? { label: 'New correspondence', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <CorrespondenceFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={(created) => {
          refetchLists();
          setCreateOpen(false);
          setSelected({ projectId: created.projectId, correspondenceId: created.id });
        }}
      />

      <CorrespondenceFormDrawer
        open={responseState !== null}
        projectId={responseState?.projectId}
        initialParentId={responseState?.parentId}
        initialDirection={responseState?.direction}
        lockedDirection
        onClose={() => setResponseState(null)}
        onSaved={(created) => {
          refetchLists();
          setResponseState(null);
          setSelected({ projectId: created.projectId, correspondenceId: created.id });
        }}
      />

      {selected ? (
        <CorrespondenceDetailDrawer
          projectId={selected.projectId}
          correspondenceId={selected.correspondenceId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
          onNavigateTo={(id) =>
            setSelected({ projectId: selected.projectId, correspondenceId: id })
          }
          onOpenCreateResponse={(opts) =>
            setResponseState({
              projectId: selected.projectId,
              parentId: opts.parentId,
              direction: opts.direction,
            })
          }
        />
      ) : null}
    </>
  );
}
