'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Modal,
  Select,
  Table,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EvaluationCycle } from '@/lib/api/evaluation.types';
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

export default function EvaluationCyclesPageContent(): React.ReactNode {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newQuarter, setNewQuarter] = useState<number | undefined>(undefined);
  const [newYear, setNewYear] = useState<number | undefined>(undefined);
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

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(
    (y) => ({ value: y, label: String(y) }),
  );

  const quarterOptions = [1, 2, 3, 4].map((q) => ({
    value: q,
    label: `Q${q} — ${['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][q - 1]}`,
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
          <span className="erp-users-cell-sub">—</span>
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
      title: 'Actions',
      key: 'actions',
      render: (_value, row) => (
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {row.status === 'DRAFT' ? (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => void handleActivate(row.id)}
            >
              Activate
            </Button>
          ) : null}
          {row.status === 'ACTIVE' ? (
            <>
              <Tooltip title="Create evaluations for all active employees">
                <Button
                  size="small"
                  icon={<TeamOutlined />}
                  onClick={() => void handleBulkCreate(row.id)}
                >
                  Generate
                </Button>
              </Tooltip>
              <Button
                size="small"
                danger
                icon={<LockOutlined />}
                onClick={() => handleClose(row.id)}
              >
                Close
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page">
      {contextHolder}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Total"
          value={stats.total}
          accent="slate"
          icon={<FileTextOutlined />}
        />
        <EvaluationStat
          label="Active"
          value={stats.active}
          accent="green"
          icon={<CheckCircleOutlined />}
        />
        <EvaluationStat
          label="Draft"
          value={stats.draft}
          accent="amber"
          icon={<ClockCircleOutlined />}
        />
        <EvaluationStat
          label="Closed"
          value={stats.closed}
          accent="slate"
          icon={<LockOutlined />}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">Evaluation Cycles</h3>
            <span className="erp-users-count-pill">
              {stats.total.toLocaleString()}
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

        <div className="erp-pro-table-card-body">
          <Table
            dataSource={cycles}
            columns={columns}
            rowKey="id"
            loading={cyclesQuery.isLoading}
            pagination={false}
            className="erp-pro-table erp-users-table"
          />
        </div>
      </div>

      <Modal
        title="Create Evaluation Cycle"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="Create"
      >
        <div className="flex flex-col gap-4 py-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">
              Quarter
            </label>
            <Select
              value={newQuarter}
              onChange={setNewQuarter}
              options={quarterOptions}
              className="w-full"
              allowClear
              placeholder="Select quarter"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">
              Year
            </label>
            <Select
              value={newYear}
              onChange={setNewYear}
              options={yearOptions}
              className="w-full"
              allowClear
              placeholder="Select year"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
