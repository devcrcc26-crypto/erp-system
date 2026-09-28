'use client';

import { useState } from 'react';
import {
  Button,
  Modal,
  Select,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { EvaluationCycle } from '@/lib/api/evaluation.types';
import {
  useActivateCycle,
  useBulkCreateEvaluations,
  useCloseCycle,
  useCreateEvaluationCycle,
  useEvaluationCycles,
} from '@/lib/query/evaluation';
import {
  CYCLE_STATUS_COLORS,
  CYCLE_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
} from '@/lib/utils/evaluation-status';

export default function EvaluationCyclesPageContent(): React.ReactNode {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newQuarter, setNewQuarter] = useState<number>(1);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
  const [messageApi, contextHolder] = message.useMessage();

  const cyclesQuery = useEvaluationCycles();
  const createCycle = useCreateEvaluationCycle();
  const activateCycle = useActivateCycle();
  const closeCycle = useCloseCycle();
  const bulkCreate = useBulkCreateEvaluations();

  async function handleCreate(): Promise<void> {
    setCreating(true);
    try {
      await createCycle.mutateAsync({ quarter: newQuarter, year: newYear });
      setCreateOpen(false);
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
        <div>
          <div style={{ fontWeight: 600 }}>
            {getQuarterLabel(row.quarter, row.year)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {getQuarterPeriodLabel(row.quarter, row.year)}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, row) => (
        <Tag color={CYCLE_STATUS_COLORS[row.status]}>
          {CYCLE_STATUS_LABELS[row.status]}
        </Tag>
      ),
    },
    {
      title: 'Template',
      key: 'template',
      render: (_value, row) => row.template?.name ?? '—',
    },
    {
      title: 'Evaluations',
      key: 'evaluations',
      render: (_value, row) => (
        <Tag icon={<TeamOutlined />} color="blue">
          {row._count?.evaluations ?? 0}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_value, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {row.status === 'DRAFT' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => void handleActivate(row.id)}
            >
              Activate
            </Button>
          )}
          {row.status === 'ACTIVE' && (
            <>
              <Tooltip title="Create evaluations for all active employees">
                <Button
                  size="small"
                  icon={<TeamOutlined />}
                  onClick={() => void handleBulkCreate(row.id)}
                >
                  Generate Evaluations
                </Button>
              </Tooltip>
              <Button
                size="small"
                danger
                icon={<LockOutlined />}
                onClick={() => handleClose(row.id)}
              >
                Close Cycle
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page">
      {contextHolder}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Evaluation Cycles</h2>
          <p
            style={{
              margin: 0,
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            Manage quarterly evaluation cycles
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          New Cycle
        </Button>
      </div>

      <Table
        dataSource={cyclesQuery.data ?? []}
        columns={columns}
        rowKey="id"
        loading={cyclesQuery.isLoading}
        pagination={false}
      />

      <Modal
        title="Create Evaluation Cycle"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="Create"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '16px 0',
          }}
        >
          <div>
            <label
              style={{ display: 'block', marginBottom: 6, fontSize: 13 }}
            >
              Quarter
            </label>
            <Select
              value={newQuarter}
              onChange={setNewQuarter}
              options={quarterOptions}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', marginBottom: 6, fontSize: 13 }}
            >
              Year
            </label>
            <Select
              value={newYear}
              onChange={setNewYear}
              options={yearOptions}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
