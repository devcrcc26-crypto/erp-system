'use client';

import { useMemo, useState } from 'react';
import { Input, Progress, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import {
  useEvaluationCycles,
  useEvaluations,
} from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_COLORS,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';

export default function EvaluationsOverviewPageContent(): React.ReactNode {
  const router = useRouter();
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [search, setSearch] = useState('');

  const cyclesQuery = useEvaluationCycles();
  const evaluationsQuery = useEvaluations(
    selectedCycleId ? { cycleId: selectedCycleId } : undefined,
  );

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
        <div>
          <div style={{ fontWeight: 500 }}>
            {row.employee.firstName} {row.employee.lastName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {row.employee.employeeId ?? '—'}
          </div>
        </div>
      ),
    },
    {
      title: 'Cycle',
      key: 'cycle',
      render: (_value, row) =>
        getQuarterLabel(row.cycle.quarter, row.cycle.year),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, row) => (
        <Tag color={EVALUATION_STATUS_COLORS[row.status]}>
          {EVALUATION_STATUS_LABELS[row.status]}
        </Tag>
      ),
    },
    {
      title: 'Final Score',
      key: 'score',
      render: (_value, row) => {
        const score = row.adjustedScore ?? row.finalScore;
        if (score == null) {
          return (
            <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontWeight: 600,
                color: getScoreColor(score),
                fontSize: 16,
              }}
            >
              {Number(score).toFixed(1)}
            </span>
            <span
              style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
            >
              {getScoreLabel(Number(score))}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Team Lead',
      key: 'teamLead',
      render: (_value, row) =>
        row.teamLead ? (
          `${row.teamLead.firstName} ${row.teamLead.lastName}`
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            Not assigned
          </span>
        ),
    },
    {
      title: 'Discipline Lead',
      key: 'disciplineLead',
      render: (_value, row) =>
        row.disciplineLead ? (
          `${row.disciplineLead.firstName} ${row.disciplineLead.lastName}`
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            Not assigned
          </span>
        ),
    },
    {
      title: '',
      key: 'action',
      render: (_value, row) => (
        <Link
          href={`/hr/evaluations/${row.id}`}
          style={{ fontSize: 13 }}
          onClick={(event) => event.stopPropagation()}
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Employee Evaluations</h2>
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          Overview of all employee evaluations
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Total', value: total, color: 'var(--color-text-primary)' },
          { label: 'Completed', value: completed, color: '#52c41a' },
          { label: 'Disputed', value: disputed, color: '#fa8c16' },
          {
            label: 'Pending',
            value: pending,
            color: 'var(--color-text-tertiary)',
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: 'var(--color-bg-secondary)',
              borderRadius: 8,
              padding: '12px 16px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>
              {item.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Progress
            percent={Math.round((completed / total) * 100)}
            strokeColor="#52c41a"
            format={(p) => `${p}% complete`}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input.Search
          placeholder="Search by name or employee ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
          allowClear
        />
        <Select
          value={selectedCycleId}
          onChange={setSelectedCycleId}
          options={cycleOptions}
          style={{ width: 160 }}
          placeholder="Filter by cycle"
        />
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={evaluationsQuery.isLoading}
        pagination={{ pageSize: 20 }}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/evaluations/${row.id}`),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}
