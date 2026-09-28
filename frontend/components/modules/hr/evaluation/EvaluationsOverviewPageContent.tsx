'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  Progress,
  Select,
  Table,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import {
  useEvaluationCycles,
  useEvaluations,
  useTriggerEvaluationAutoResolve,
} from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import EvaluationStat from './EvaluationStat';

export default function EvaluationsOverviewPageContent(): React.ReactNode {
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const cyclesQuery = useEvaluationCycles();
  const evaluationsQuery = useEvaluations(
    selectedCycleId ? { cycleId: selectedCycleId } : undefined,
  );
  const autoResolve = useTriggerEvaluationAutoResolve();

  async function handleManualAutoResolve(): Promise<void> {
    try {
      const result = await autoResolve.mutateAsync();
      void messageApi.success(
        result.resolved > 0
          ? `Auto-resolved ${result.resolved} evaluation(s)`
          : 'No evaluations needed auto-resolution',
      );
      void evaluationsQuery.refetch();
    } catch {
      void messageApi.error('Failed to run auto-resolve');
    }
  }

  const cycleOptions = useMemo(
    () => [
      { value: '', label: 'All Cycles' },
      ...(cyclesQuery.data ?? []).map((c) => ({
        value: c.id,
        label: getQuarterLabel(c.quarter, c.year),
      })),
    ],
    [cyclesQuery.data],
  );

  const filtered = useMemo(() => {
    const rows = evaluationsQuery.data ?? [];
    if (!search.trim()) {
      return rows;
    }
    const q = search.toLowerCase();
    return rows.filter((ev) => {
      const name =
        `${ev.employee.firstName} ${ev.employee.lastName}`.toLowerCase();
      const empId = (ev.employee.employeeId ?? '').toLowerCase();
      return name.includes(q) || empId.includes(q);
    });
  }, [evaluationsQuery.data, search]);

  const total = filtered.length;
  const completed = filtered.filter(
    (e) => e.status === 'LOCKED' || e.status === 'ACCEPTED',
  ).length;
  const disputed = filtered.filter(
    (e) => e.status === 'DISPUTED' || e.status === 'ESCALATED',
  ).length;
  const pending = filtered.filter((e) => e.status === 'PENDING').length;

  const columns: ColumnsType<EmployeeEvaluation> = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_value, row) => (
        <div className="min-w-0">
          <p className="erp-users-cell-strong m-0">
            {row.employee.firstName} {row.employee.lastName}
          </p>
          <p className="erp-users-email m-0 mt-0.5">
            {row.employee.employeeId ?? '—'}
          </p>
        </div>
      ),
    },
    {
      title: 'Cycle',
      key: 'cycle',
      width: 120,
      render: (_value, row) => (
        <span className="erp-users-id-chip">
          {getQuarterLabel(row.cycle.quarter, row.cycle.year)}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 150,
      render: (_value, row) => (
        <StatusBadge
          label={EVALUATION_STATUS_LABELS[row.status]}
          variant={EVALUATION_STATUS_BADGE[row.status]}
        />
      ),
    },
    {
      title: 'Final Score',
      key: 'score',
      width: 160,
      render: (_value, row) => {
        const score = row.adjustedScore ?? row.finalScore;
        if (score == null) {
          return <span className="erp-users-cell-sub">—</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <span
              className="erp-evaluation-score"
              style={{ fontSize: 16, color: getScoreColor(Number(score)) }}
            >
              {Number(score).toFixed(1)}
            </span>
            <span className="erp-users-cell-sub">
              {getScoreLabel(Number(score))}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Team Lead',
      key: 'teamLead',
      responsive: ['lg'],
      render: (_value, row) =>
        row.teamLead ? (
          <span className="erp-users-cell-strong">
            {row.teamLead.firstName} {row.teamLead.lastName}
          </span>
        ) : (
          <span className="erp-users-cell-sub">Not assigned</span>
        ),
    },
    {
      title: 'Discipline Lead',
      key: 'disciplineLead',
      responsive: ['xl'],
      render: (_value, row) =>
        row.disciplineLead ? (
          <span className="erp-users-cell-strong">
            {row.disciplineLead.firstName} {row.disciplineLead.lastName}
          </span>
        ) : (
          <span className="erp-users-cell-sub">Not assigned</span>
        ),
    },
    {
      title: '',
      key: 'action',
      width: 72,
      render: (_value, row) => (
        <Link
          href={`/hr/evaluations/${row.id}`}
          className="text-[13px] font-medium text-[#185FA5]"
          onClick={(event) => event.stopPropagation()}
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page">
      {contextHolder}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Total"
          value={total}
          accent="slate"
          icon={<TeamOutlined />}
        />
        <EvaluationStat
          label="Completed"
          value={completed}
          accent="green"
          icon={<CheckCircleOutlined />}
        />
        <EvaluationStat
          label="Disputed"
          value={disputed}
          accent="amber"
          icon={<ExclamationCircleOutlined />}
        />
        <EvaluationStat
          label="Pending"
          value={pending}
          accent="blue"
          icon={<ClockCircleOutlined />}
        />
      </div>

      {total > 0 ? (
        <div className="mb-4 px-1">
          <Progress
            percent={Math.round((completed / total) * 100)}
            strokeColor="#1D9E75"
            trailColor="#E8EBEF"
            format={(p) => `${p}% complete`}
          />
        </div>
      ) : null}

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">Employee Evaluations</h3>
            <span className="erp-users-count-pill">
              {total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title="Refresh">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={
                  evaluationsQuery.isFetching && !evaluationsQuery.isLoading
                }
                onClick={() => void evaluationsQuery.refetch()}
                aria-label="Refresh"
              />
            </Tooltip>
            {canViewHr ? (
              <Button
                size="small"
                onClick={() => void handleManualAutoResolve()}
                loading={autoResolve.isPending}
              >
                Run Auto-Resolve
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder="Search by name or employee ID"
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Select
            value={selectedCycleId}
            onChange={setSelectedCycleId}
            options={cycleOptions}
            className="erp-users-filter-select"
            placeholder="Filter by cycle"
          />
        </div>

        <div className="erp-pro-table-card-body">
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={evaluationsQuery.isLoading}
            pagination={{ pageSize: 20 }}
            className="erp-pro-table erp-users-table"
            onRow={(row) => ({
              onClick: () => router.push(`/hr/evaluations/${row.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      </div>
    </div>
  );
}
