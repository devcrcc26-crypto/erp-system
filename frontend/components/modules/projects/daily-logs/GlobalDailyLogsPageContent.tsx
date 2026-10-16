'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Calendar } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import { ApiRequestError } from '@/lib/api/errors';
import type { DailyLog } from '@/lib/api/project-management.types';
import {
  useAllDailyLogs,
  useMyDailyLogProjects,
  useMyDailyLogs,
} from '@/lib/query/daily-logs';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import { DailyLogFormDrawer } from '@/components/modules/projects/daily-logs/DailyLogsPageContent';
import DailyLogDetailDrawer from '@/components/modules/projects/daily-logs/DailyLogDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewDailyLogs,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';

const DAILY_LOG_ACTIVE_STATUSES = 'DRAFT,SUBMITTED';
const DAILY_LOG_APPROVED_STATUSES = 'APPROVED';

/**
 * Global Daily Logs list - cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalDailyLogsPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    dailyLogId: string;
  } | null>(null);

  const resolveUserDisplay = useUserDisplayResolver();
  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.dailyLogs.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewDailyLogs();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.dailyLogs.canCreate;

  const statusFilter =
    activeTab === 'active'
      ? DAILY_LOG_ACTIVE_STATUSES
      : DAILY_LOG_APPROVED_STATUSES;

  const listParams = {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    projectId: projectFilter,
  };

  const myQuery = useMyDailyLogs(
    listParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allQuery = useAllDailyLogs(
    listParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const logsQuery = portfolioMode ? allQuery : myQuery;

  const activeCountParams = {
    ...params,
    search: search.trim() || undefined,
    status: DAILY_LOG_ACTIVE_STATUSES,
    projectId: projectFilter,
  };
  const approvedCountParams = {
    ...params,
    search: search.trim() || undefined,
    status: DAILY_LOG_APPROVED_STATUSES,
    projectId: projectFilter,
  };

  const activeCountAllQuery = useAllDailyLogs(
    { ...activeCountParams, page: 1, limit: 1 },
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const activeCountMyQuery = useMyDailyLogs(
    { ...activeCountParams, page: 1, limit: 1 },
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const approvedCountAllQuery = useAllDailyLogs(
    { ...approvedCountParams, page: 1, limit: 1 },
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const approvedCountMyQuery = useMyDailyLogs(
    { ...approvedCountParams, page: 1, limit: 1 },
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const activeCountQuery = portfolioMode ? activeCountAllQuery : activeCountMyQuery;
  const approvedCountQuery = portfolioMode ? approvedCountAllQuery : approvedCountMyQuery;

  const myProjectsQuery = useMyDailyLogProjects(
    capabilitiesReady && !portfolioMode && canCreate,
  );
  const allProjectsQuery = useAllProjects(
    {},
    capabilitiesReady && (portfolioMode || canCreate),
  );

  const projectFilterOptions = useMemo(
    () =>
      portfolioMode
        ? (allProjectsQuery.data?.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} - ${p.name}`,
          }))
        : (myProjectsQuery.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.projectCode} - ${p.name}`,
          })),
    [portfolioMode, allProjectsQuery.data?.data, myProjectsQuery.data],
  );

  const columns: ColumnsType<DailyLog> = useMemo(
    () => [
      {
        title: 'Log #',
        dataIndex: 'logNumber',
        key: 'logNumber',
        render: (value: string | null, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={(e) => {
              e.stopPropagation();
              setSelected({
                projectId: record.projectId,
                dailyLogId: record.id,
              });
            }}
          >
            {value?.trim() || formatProjectDate(record.logDate)}
          </Button>
        ),
      },
      {
        title: 'Date',
        dataIndex: 'logDate',
        key: 'logDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: DailyLog) =>
          record.projectCode?.trim() || '-',
      },
      {
        title: 'Shift',
        dataIndex: 'shift',
        key: 'shift',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Weather',
        dataIndex: 'weatherCondition',
        key: 'weatherCondition',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Workforce',
        key: 'workforce',
        render: (_: unknown, record: DailyLog) =>
          record.totalWorkers || record.workforceCount || '-',
      },
      {
        title: 'Incidents',
        dataIndex: 'incidentCount',
        key: 'incidentCount',
        render: (value: number) =>
          value > 0 ? (
            <span className="font-medium text-red-500">{value}</span>
          ) : (
            '0'
          ),
      },
      {
        title: 'Supervisor',
        key: 'supervisor',
        render: (_: unknown, record: DailyLog) =>
          record.supervisorId
            ? resolveUserDisplay(record.supervisorId, record.supervisorName)
            : '-',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => (
          <StatusBadge
            label={formatDailyLogStatus(status)}
            variant={dailyLogStatusVariant(status)}
          />
        ),
      },
      {
        title: '',
        key: 'open',
        width: 80,
        render: (_: unknown, record: DailyLog) => (
          <Button
            type="text"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(
                `/projects/${record.projectId}/daily-logs/${record.id}`,
              );
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay, router],
  );

  if (!capabilitiesReady || (logsQuery.isLoading && !logsQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to view daily logs."
      />
    );
  }

  const apiUnavailable =
    logsQuery.isError &&
    logsQuery.error instanceof ApiRequestError &&
    (logsQuery.error.status === 404 || logsQuery.error.status === 0);

  const rows = logsQuery.data?.data ?? [];
  const meta = logsQuery.data?.meta;

  const refetchLists = (): void => {
    void logsQuery.refetch();
    void activeCountQuery.refetch();
    void approvedCountQuery.refetch();
  };

  return (
    <>
      <FormLayout
        title="Daily logs"
        description={
          portfolioMode
            ? 'All daily logs across projects.'
            : 'Daily logs you created or supervise.'
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New daily log
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Daily log APIs are not connected yet."
            description="This page is ready - data will appear when the backend is available."
          />
        )}

        {logsQuery.isError && !apiUnavailable && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load daily logs"
            description={
              logsQuery.error instanceof ApiRequestError
                ? logsQuery.error.message
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
          activeLabel="Active"
          closedLabel="Approved"
          activeCount={activeCountQuery.data?.meta.total}
          closedCount={approvedCountQuery.data?.meta.total}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by log number or contractor"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            showSearch
            placeholder="Project"
            className={layout.filterControl}
            value={projectFilter}
            optionFilterProp="label"
            loading={
              portfolioMode
                ? allProjectsQuery.isLoading
                : myProjectsQuery.isLoading
            }
            onChange={(value: string | undefined) => {
              resetPage();
              setProjectFilter(value);
            }}
            options={projectFilterOptions}
          />
        </Space>

        <TableUpdatingIndicator
          active={logsQuery.isFetching && Boolean(logsQuery.data)}
        />

        <DataTable<DailyLog>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({
                projectId: record.projectId,
                dailyLogId: record.id,
              }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Calendar />}
                title="No daily logs found"
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'New daily log',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <DailyLogFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={(createdLog) => {
          refetchLists();
          setCreateOpen(false);
          if (createdLog) {
            setSelected({
              projectId: createdLog.projectId,
              dailyLogId: createdLog.id,
            });
          }
        }}
      />

      {selected ? (
        <DailyLogDetailDrawer
          projectId={selected.projectId}
          dailyLogId={selected.dailyLogId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      ) : null}
    </>
  );
}
