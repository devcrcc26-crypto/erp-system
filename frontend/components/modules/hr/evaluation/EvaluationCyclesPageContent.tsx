'use client';

import './evaluation-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Grid,
  Input,
  Modal,
  Select,
  Spin,
  Tooltip,
  message,
  type MenuProps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import type {
  EvaluationCycle,
  EvaluationCycleStatus,
} from '@/lib/api/evaluation.types';
import {
  useActivateCycle,
  useBulkCreateEvaluations,
  useCloseCycle,
  useCreateEvaluationCycle,
  useEvaluationCycles,
} from '@/lib/query/evaluation';
import {
  CYCLE_STATUS_BADGE,
  CYCLE_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
} from '@/lib/utils/evaluation-status';
import EvaluationStat from './EvaluationStat';

type CycleFilter = 'all' | EvaluationCycleStatus;

export default function EvaluationCyclesPageContent(): React.ReactNode {
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newQuarter, setNewQuarter] = useState<number | undefined>(undefined);
  const [newYear, setNewYear] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<CycleFilter>('all');
  const [search, setSearch] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const cyclesQuery = useEvaluationCycles();
  const createCycle = useCreateEvaluationCycle();
  const activateCycle = useActivateCycle();
  const closeCycle = useCloseCycle();
  const bulkCreate = useBulkCreateEvaluations();

  const cycles = cyclesQuery.data ?? [];
  const stats = useMemo(
    () => ({
      total: cycles.length,
      active: cycles.filter((c) => c.status === 'ACTIVE').length,
      draft: cycles.filter((c) => c.status === 'DRAFT').length,
      closed: cycles.filter((c) => c.status === 'CLOSED').length,
    }),
    [cycles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cycles.filter((cycle) => {
      if (statusFilter !== 'all' && cycle.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      const label = getQuarterLabel(cycle.quarter, cycle.year).toLowerCase();
      const template = (cycle.template?.name ?? '').toLowerCase();
      return label.includes(q) || template.includes(q);
    });
  }, [cycles, statusFilter, search]);

  async function handleCreate(): Promise<void> {
    if (newQuarter == null || newYear == null) {
      void messageApi.warning('Select a quarter and year');
      return;
    }
    setCreating(true);
    try {
      await createCycle.mutateAsync({ quarter: newQuarter, year: newYear });
      setCreateOpen(false);
      setNewQuarter(undefined);
      setNewYear(undefined);
      void messageApi.success('Evaluation cycle created');
    } catch {
      void messageApi.error('Failed to create cycle');
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id: string): Promise<void> {
    try {
      await activateCycle.mutateAsync(id);
      void messageApi.success('Cycle activated');
    } catch {
      void messageApi.error('Failed to activate cycle');
    }
  }

  async function handleBulkCreate(id: string): Promise<void> {
    try {
      const result = await bulkCreate.mutateAsync(id);
      void messageApi.success(
        `Created ${result.created} evaluations (${result.skipped} already existed)`,
      );
    } catch {
      void messageApi.error('Failed to create evaluations');
    }
  }

  function handleClose(id: string): void {
    Modal.confirm({
      title: 'Close Evaluation Cycle',
      content: 'Are you sure? This cannot be undone.',
      onOk: async () => {
        try {
          await closeCycle.mutateAsync(id);
          void messageApi.success('Cycle closed');
        } catch {
          void messageApi.error('Failed to close cycle');
        }
      },
    });
  }

  function buildActionMenu(row: EvaluationCycle): MenuProps['items'] {
    const items: MenuProps['items'] = [];
    if (row.status === 'DRAFT') {
      items.push({
        key: 'activate',
        icon: <CheckCircleOutlined />,
        label: 'Activate',
        onClick: () => void handleActivate(row.id),
      });
    }
    if (row.status === 'ACTIVE') {
      items.push(
        {
          key: 'generate',
          icon: <TeamOutlined />,
          label: 'Generate evaluations',
          onClick: () => void handleBulkCreate(row.id),
        },
        {
          key: 'close',
          icon: <LockOutlined />,
          label: 'Close cycle',
          danger: true,
          onClick: () => handleClose(row.id),
        },
      );
    }
    return items;
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(
    (y) => ({ value: y, label: String(y) }),
  );

  const quarterOptions = [1, 2, 3, 4].map((q) => ({
    value: q,
    label: `Q${q} - ${['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][q - 1]}`,
  }));

  const columns: ColumnsType<EvaluationCycle> = [
    {
      title: 'Cycle',
      key: 'cycle',
      render: (_value, row) => (
        <div className="min-w-0">
          <p className="erp-users-cell-strong m-0">
            {getQuarterLabel(row.quarter, row.year)}
          </p>
          <p className="erp-users-email m-0 mt-0.5">
            {getQuarterPeriodLabel(row.quarter, row.year)}
          </p>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_value, row) => (
        <StatusBadge
          label={CYCLE_STATUS_LABELS[row.status]}
          variant={CYCLE_STATUS_BADGE[row.status]}
        />
      ),
    },
    {
      title: 'Template',
      key: 'template',
      render: (_value, row) =>
        row.template?.name ? (
          <span className="erp-users-cell-strong">{row.template.name}</span>
        ) : (
          <span className="erp-users-cell-sub">-</span>
        ),
    },
    {
      title: 'Evaluations',
      key: 'evaluations',
      width: 130,
      render: (_value, row) => (
        <span className="erp-users-id-chip">
          <TeamOutlined className="mr-1" />
          {row._count?.evaluations ?? 0}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 52,
      align: 'right',
      render: (_value, row) => {
        const items = buildActionMenu(row);
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <div
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items }}
              trigger={['click']}
              rootClassName="erp-row-actions-menu"
            >
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label="Actions"
              />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  const hasFilters = statusFilter !== 'all' || Boolean(search.trim());

  if (cyclesQuery.isLoading && !cyclesQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-v2">
        <div className="erp-evaluation-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-v2">
      {contextHolder}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Total"
          value={stats.total}
          accent="slate"
          icon={<FileTextOutlined />}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <EvaluationStat
          label="Active"
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusFilter === 'ACTIVE'}
          onClick={() => setStatusFilter('ACTIVE')}
        />
        <EvaluationStat
          label="Draft"
          value={stats.draft}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusFilter === 'DRAFT'}
          onClick={() => setStatusFilter('DRAFT')}
        />
        <EvaluationStat
          label="Closed"
          value={stats.closed}
          accent="slate"
          icon={<LockOutlined />}
          active={statusFilter === 'CLOSED'}
          onClick={() => setStatusFilter('CLOSED')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">Evaluation Cycles</h3>
            <span className="erp-users-count-pill">
              {filtered.length.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title="Refresh">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={cyclesQuery.isFetching && !cyclesQuery.isLoading}
                onClick={() => void cyclesQuery.refetch()}
                aria-label="Refresh"
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              New Cycle
            </Button>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder="Search by cycle or template"
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search by cycle or template"
          />
          {hasFilters ? (
            <Button
              type="link"
              className="!px-1"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EvaluationCycle>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={cyclesQuery.isLoading}
            pagination={false}
            size={isCompact ? 'small' : 'middle'}
            className="erp-pro-table erp-users-table"
            scroll={{ x: isCompact ? 640 : 800 }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileTextOutlined />}
                  title={
                    hasFilters
                      ? 'No matching cycles'
                      : 'No evaluation cycles'
                  }
                  description={
                    hasFilters
                      ? 'Try a different search or clear the status filter.'
                      : 'Create a cycle to start quarterly employee evaluations.'
                  }
                  action={
                    hasFilters
                      ? {
                          label: 'Clear filters',
                          onClick: () => {
                            setSearch('');
                            setStatusFilter('all');
                          },
                        }
                      : {
                          label: 'New Cycle',
                          onClick: () => setCreateOpen(true),
                        }
                  }
                />
              ),
            }}
          />
        </div>
      </div>

      <Modal
        title="Create Evaluation Cycle"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => {
          setCreateOpen(false);
          setNewQuarter(undefined);
          setNewYear(undefined);
        }}
        confirmLoading={creating}
        okText="Create cycle"
        cancelText="Cancel"
        destroyOnHidden
        centered
        width={440}
        rootClassName="erp-evaluation-modal"
        className="erp-evaluation-modal"
      >
        <p className="erp-evaluation-modal-hint">
          Choose the quarter and year for this evaluation period. The cycle
          starts as a draft - activate it when you are ready to generate
          employee evaluations.
        </p>
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label="Quarter" required>
            <Select
              value={newQuarter}
              onChange={setNewQuarter}
              options={quarterOptions}
              className="w-full"
              allowClear
              placeholder="Select quarter"
              aria-label="Quarter"
            />
          </Form.Item>
          <Form.Item label="Year" required>
            <Select
              value={newYear}
              onChange={setNewYear}
              options={yearOptions}
              className="w-full"
              allowClear
              placeholder="Select year"
              aria-label="Year"
            />
          </Form.Item>
        </Form>
        {newQuarter != null && newYear != null ? (
          <div className="erp-evaluation-modal-preview">
            <p className="erp-evaluation-modal-preview-label">Preview</p>
            <p className="erp-evaluation-modal-preview-value">
              {getQuarterLabel(newQuarter, newYear)}
            </p>
            <p className="erp-evaluation-modal-preview-sub">
              {getQuarterPeriodLabel(newQuarter, newYear)}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
