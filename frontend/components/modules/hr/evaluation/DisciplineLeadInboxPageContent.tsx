'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Empty, Table, Tag, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import { useEvaluations } from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_COLORS,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
} from '@/lib/utils/evaluation-status';

export default function DisciplineLeadInboxPageContent(): React.ReactNode {
  const router = useRouter();

  const dlEvaluationsQuery = useEvaluations({ disciplineLeadId: 'me' });
  const tlEvaluationsQuery = useEvaluations({ teamLeadId: 'me' });

  const dlEvaluations = dlEvaluationsQuery.data ?? [];
  const tlEvaluations = tlEvaluationsQuery.data ?? [];

  const needsDLAction = useMemo(
    () =>
      dlEvaluations.filter((ev) =>
        ['TEAM_LEAD_ASSESSED', 'DISPUTED'].includes(ev.status),
      ),
    [dlEvaluations],
  );

  const needsTLAction = useMemo(
    () => tlEvaluations.filter((ev) => ev.status === 'SELF_ASSESSED'),
    [tlEvaluations],
  );

  const dlByStatus = useMemo(
    () => ({
      needsAction: needsDLAction,
      inProgress: dlEvaluations.filter((ev) =>
        ['PENDING', 'SELF_ASSESSED'].includes(ev.status),
      ),
      awaitingEmployee: dlEvaluations.filter((ev) =>
        ['RESULT_SHARED', 'DL_UPHELD', 'DL_ADJUSTED'].includes(ev.status),
      ),
      escalated: dlEvaluations.filter((ev) => ev.status === 'ESCALATED'),
      completed: dlEvaluations.filter((ev) =>
        ['ACCEPTED', 'HR_DECIDED', 'LOCKED'].includes(ev.status),
      ),
    }),
    [dlEvaluations, needsDLAction],
  );

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
            {row.employee.employeeId}
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
          <span style={{ fontWeight: 600, color: getScoreColor(score) }}>
            {Number(score).toFixed(1)}
          </span>
        );
      },
    },
    {
      title: 'Disputes',
      key: 'disputes',
      render: (_value, row) =>
        (row._count?.disputes ?? 0) > 0 ? (
          <Tag color="warning">{row._count?.disputes} dispute(s)</Tag>
        ) : null,
    },
  ];

  const tlColumns: ColumnsType<EmployeeEvaluation> = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_value, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {row.employee.firstName} {row.employee.lastName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {row.employee.employeeId}
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
  ];

  function openEvaluation(row: EmployeeEvaluation): void {
    router.push(`/hr/evaluations/${row.id}`);
  }

  const tabItems = [
    {
      key: 'needs-action',
      label: (
        <span>
          Needs My Action
          {needsDLAction.length > 0 ? (
            <Badge count={needsDLAction.length} style={{ marginLeft: 6 }} />
          ) : null}
        </span>
      ),
      children:
        needsDLAction.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No evaluations need your action"
          />
        ) : (
          <Table
            dataSource={needsDLAction}
            columns={columns}
            rowKey="id"
            loading={dlEvaluationsQuery.isLoading}
            pagination={false}
            onRow={(row) => ({
              onClick: () => openEvaluation(row),
              style: { cursor: 'pointer' },
            })}
          />
        ),
    },
    {
      key: 'team-lead',
      label: (
        <span>
          As Team Lead
          {needsTLAction.length > 0 ? (
            <Badge count={needsTLAction.length} style={{ marginLeft: 6 }} />
          ) : null}
        </span>
      ),
      children:
        tlEvaluations.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No evaluations assigned to you as Team Lead"
          />
        ) : (
          <Table
            dataSource={tlEvaluations}
            columns={tlColumns}
            rowKey="id"
            loading={tlEvaluationsQuery.isLoading}
            pagination={false}
            onRow={(row) => ({
              onClick: () => openEvaluation(row),
              style: { cursor: 'pointer' },
            })}
          />
        ),
    },
    {
      key: 'awaiting-employee',
      label: `Awaiting Employee (${dlByStatus.awaitingEmployee.length})`,
      children:
        dlByStatus.awaitingEmployee.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No evaluations awaiting employee response"
          />
        ) : (
          <Table
            dataSource={dlByStatus.awaitingEmployee}
            columns={columns}
            rowKey="id"
            pagination={false}
            onRow={(row) => ({
              onClick: () => openEvaluation(row),
              style: { cursor: 'pointer' },
            })}
          />
        ),
    },
    {
      key: 'escalated',
      label: (
        <span>
          Escalated to HR
          {dlByStatus.escalated.length > 0 ? (
            <Badge
              count={dlByStatus.escalated.length}
              color="red"
              style={{ marginLeft: 6 }}
            />
          ) : null}
        </span>
      ),
      children:
        dlByStatus.escalated.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No escalated evaluations"
          />
        ) : (
          <Table
            dataSource={dlByStatus.escalated}
            columns={columns}
            rowKey="id"
            pagination={false}
            onRow={(row) => ({
              onClick: () => openEvaluation(row),
              style: { cursor: 'pointer' },
            })}
          />
        ),
    },
    {
      key: 'in-progress',
      label: `In Progress (${dlByStatus.inProgress.length})`,
      children: (
        <Table
          dataSource={dlByStatus.inProgress}
          columns={columns}
          rowKey="id"
          pagination={false}
          onRow={(row) => ({
            onClick: () => openEvaluation(row),
            style: { cursor: 'pointer' },
          })}
        />
      ),
    },
    {
      key: 'completed',
      label: `Completed (${dlByStatus.completed.length})`,
      children: (
        <Table
          dataSource={dlByStatus.completed}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          onRow={(row) => ({
            onClick: () => openEvaluation(row),
            style: { cursor: 'pointer' },
          })}
        />
      ),
    },
  ];

  const totalNeedsAction = needsDLAction.length + needsTLAction.length;

  return (
    <div className="erp-pro-list-page">
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>My Evaluation Inbox</h2>
          {totalNeedsAction > 0 ? (
            <Badge
              count={totalNeedsAction}
              title={`${totalNeedsAction} evaluation(s) need your action`}
            />
          ) : null}
        </div>
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          Evaluations assigned to you as Discipline Lead or Team Lead
        </p>
      </div>

      <Tabs items={tabItems} defaultActiveKey="needs-action" />
    </div>
  );
}
