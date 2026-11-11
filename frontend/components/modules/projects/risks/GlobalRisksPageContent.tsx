'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { Risk, RiskCategory, RiskStatus } from '@/lib/api/project-management.types';
import { useMyRisks, useAllRisks, useMyRiskProjects } from '@/lib/query/risks';
import { useAllProjects } from '@/lib/query/projects';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRiskCategory,
  formatRiskStatus,
  riskScoreVariant,
  riskStatusVariant,
} from '@/lib/utils/pm-status-display';
import {
  RISK_OPEN_STATUSES,
  RISK_RESOLVED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import { RiskFormDrawer } from '@/components/modules/projects/risks/RisksPageContent';
import RiskDetailDrawer from '@/components/modules/projects/risks/RiskDetailDrawer';
import RiskMatrix, {
  matchesRiskMatrixCell,
  type RiskMatrixCell,
} from '@/components/modules/projects/risks/RiskMatrix';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewRisks,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { tokens } from '@/lib/theme/tokens';

/**
 * Global Risks list - cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalRisksPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RiskStatus | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    riskId: string;
  } | null>(null);
  const [matrixVisible, setMatrixVisible] = useState(true);
  const [selectedCell, setSelectedCell] = useState<RiskMatrixCell | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() && (pm.risks.canView));
  const canViewPersonal = useCanViewRisks();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate = epc.navFullAccess || epc.navDisciplineLeader || (pm.risks.canCreate);

  const filterParams = {
    search: search.trim() || undefined,
    projectId: portfolioMode ? projectFilter : undefined,
  };

  const openListParams = {
    ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RISK_OPEN_STATUSES,
      activeTab === 'active' ? statusFilter : undefined,
    ),
  };
  const resolvedListParams = {
    ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
    ...filterParams,
    status: resolveTabStatusFilter(
      RISK_RESOLVED_STATUSES,
      activeTab === 'closed' ? statusFilter : undefined,
    ),
  };

  const myOpenQuery = useMyRisks(openListParams, capabilitiesReady && canAccessPage && !portfolioMode);
  const myResolvedQuery = useMyRisks(
    resolvedListParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allOpenQuery = useAllRisks(openListParams, capabilitiesReady && canAccessPage && portfolioMode);
  const allResolvedQuery = useAllRisks(
    resolvedListParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );

  const openQuery = portfolioMode ? allOpenQuery : myOpenQuery;
  const resolvedQuery = portfolioMode ? allResolvedQuery : myResolvedQuery;
  const risksQuery = activeTab === 'active' ? openQuery : resolvedQuery;

  // Full set for matrix counts + cell-click filtering (API max limit is 100).
  const myMatrixQuery = useMyRisks(
    { page: 1, limit: 100 },
    capabilitiesReady && canAccessPage && !portfolioMode && matrixVisible && activeTab === 'active',
  );
  const allMatrixQuery = useAllRisks(
    { page: 1, limit: 100 },
    capabilitiesReady && canAccessPage && portfolioMode && matrixVisible && activeTab === 'active',
  );
  const matrixQuery = portfolioMode ? allMatrixQuery : myMatrixQuery;
  const matrixRisks = matrixQuery.data?.data ?? [];

  const tableRows = useMemo(() => {
    const rows = risksQuery.data?.data ?? [];
    if (!selectedCell || activeTab !== 'active') {
      return rows;
    }
    return matrixRisks.filter((risk) => matchesRiskMatrixCell(risk, selectedCell));
  }, [risksQuery.data?.data, matrixRisks, selectedCell, activeTab]);

  const myProjectsQuery = useMyRiskProjects(capabilitiesReady && !portfolioMode && canCreate);
  const allProjectsQuery = useAllProjects({}, capabilitiesReady && portfolioMode);

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

  const columns: ColumnsType<Risk> = useMemo(
    () => [
      {
        title: 'Risk #',
        dataIndex: 'riskIdCode',
        key: 'riskIdCode',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            style={{ color: tokens.colorTeal600 }}
            onClick={() => setSelected({ projectId: record.projectId, riskId: record.id })}
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
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
        render: (value: RiskCategory) => formatRiskCategory(value),
      },
      {
        title: 'Likelihood',
        dataIndex: 'probability',
        key: 'probability',
      },
      {
        title: 'Impact',
        dataIndex: 'impact',
        key: 'impact',
      },
      {
        title: 'Score',
        dataIndex: 'riskScore',
        key: 'riskScore',
        render: (score: number) => (
          <StatusBadge label={String(score)} variant={riskScoreVariant(score)} />
        ),
      },
      {
        title: 'Residual score',
        dataIndex: 'residualScore',
        key: 'residualScore',
        render: (score: number | null) =>
          score != null ? (
            <StatusBadge label={String(score)} variant={riskScoreVariant(score)} />
          ) : (
            '-'
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: RiskStatus) => (
          <StatusBadge label={formatRiskStatus(status)} variant={riskStatusVariant(status)} />
        ),
      },
      {
        title: 'Owner',
        key: 'owner',
        render: (_: unknown, record: Risk) => record.ownerName ?? '-',
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Risk) => record.projectCode?.trim() || '-',
      },
      {
        title: '',
        key: 'open',
        width: 70,
        render: (_: unknown, record: Risk) => (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${record.projectId}/risks/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [router],
  );

  if (!capabilitiesReady || (risksQuery.isLoading && !risksQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return <Alert type="warning" showIcon title="You do not have access to view risks." />;
  }

  const apiUnavailable =
    risksQuery.isError &&
    risksQuery.error instanceof ApiRequestError &&
    (risksQuery.error.status === 404 || risksQuery.error.status === 0);

  const meta = risksQuery.data?.meta;
  const openCount = openQuery.data?.meta?.total ?? 0;
  const resolvedCount = resolvedQuery.data?.meta?.total ?? 0;

  const refetchLists = (): void => {
    void openQuery.refetch();
    void resolvedQuery.refetch();
    void matrixQuery.refetch();
  };

  return (
    <>
      <FormLayout
        title="Risks"
        description={
          portfolioMode ? 'All risks across projects.' : 'Risks owned by or relevant to you.'
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New risk
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Risk APIs are not connected yet."
            description="This page is ready - data will appear when the backend is available."
          />
        )}

        <ListStatusTabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setStatusFilter(undefined);
            setSelectedCell(null);
            resetPage();
          }}
          activeLabel="Active"
          closedLabel="Closed"
          activeCount={openCount}
          closedCount={resolvedCount}
        />

        {activeTab === 'active' && (
          <>
            <div className="!mb-4 flex items-center justify-between">
              <h3 className={layout.drawerHeading}>Risk matrix</h3>
              <Button size="small" onClick={() => setMatrixVisible((v) => !v)}>
                {matrixVisible ? 'Hide Matrix' : 'Show Matrix'}
              </Button>
            </div>
            {matrixVisible && (
              <div className={`!mb-4 ${layout.drawerSurface}`}>
                <RiskMatrix
                  risks={matrixRisks}
                  selectedCell={selectedCell}
                  onCellClick={(cell) => {
                    resetPage();
                    setSelectedCell(cell);
                  }}
                />
              </div>
            )}
          </>
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by title or risk number"
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
            onChange={(value: RiskStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(RISK_OPEN_STATUSES, formatRiskStatus)
                : buildTabStatusFilterOptions(RISK_RESOLVED_STATUSES, formatRiskStatus)
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
              loading={allProjectsQuery.isLoading}
              onChange={(value: string | undefined) => {
                resetPage();
                setProjectFilter(value);
              }}
              options={projectFilterOptions}
            />
          ) : null}
          {selectedCell && (
            <Button size="small" onClick={() => setSelectedCell(null)}>
              Clear matrix filter
            </Button>
          )}
        </Space>

        <TableUpdatingIndicator active={risksQuery.isFetching && Boolean(risksQuery.data)} />

        <DataTable<Risk>
          rowKey="id"
          columns={columns}
          dataSource={tableRows}
          pagination={
            selectedCell && activeTab === 'active' ? false : bindMeta(meta)
          }
          onRow={(record) => ({
            onClick: () => setSelected({ projectId: record.projectId, riskId: record.id }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ShieldAlert />}
                title="No risks found"
                action={
                  canCreate && !apiUnavailable
                    ? { label: 'New risk', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <RiskFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          refetchLists();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <RiskDetailDrawer
          projectId={selected.projectId}
          riskId={selected.riskId}
          onClose={() => setSelected(null)}
          onUpdated={() => refetchLists()}
        />
      ) : null}
    </>
  );
}
