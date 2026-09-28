'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Empty, Table, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import { useEvaluations } from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
} from '@/lib/utils/evaluation-status';
import EvaluationStat from './EvaluationStat';

export default function DisciplineLeadInboxPageContent(): React.ReactNode {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('needs-action');

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
    [dlEvaluations],
  );

  const totalNeedsAction = needsDLAction.length + needsTLAction.length;

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
      width: 110,
      render: (_value, row) => {
        const score = row.adjustedScore ?? row.finalScore;
        if (score == null) {
          return <span className="erp-users-cell-sub">—</span>;
        }
        return (
          <span
            className="font-semibold"
            style={{ color: getScoreColor(Number(score)) }}
          >
            {Number(score).toFixed(1)}
          </span>
        );
      },
    },
    {
      title: 'Disputes',
      key: 'disputes',
      width: 110,
      render: (_value, row) =>
        (row._count?.disputes ?? 0) > 0 ? (
          <StatusBadge
            label={`${row._count?.disputes} dispute(s)`}
            variant="warning"
          />
        ) : (
          <span className="erp-users-cell-sub">—</span>
        ),
    },
  ];

  const tlColumns: ColumnsType<EmployeeEvaluation> = columns.slice(0, 3);

  function openEvaluation(row: EmployeeEvaluation): void {
    router.push(`/hr/evaluations/${row.id}`);
  }

  function renderTable(
    data: EmployeeEvaluation[],
    cols: ColumnsType<EmployeeEvaluation>,
    loading: boolean,
    empty: string,
    paginate = false,
  ): React.ReactNode {
    if (!loading && data.length === 0) {
      return (
        <div className="px-4 py-10">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
        </div>
      );
    }
    return (
      <div className="erp-pro-table-card-body">
        <Table
          dataSource={data}
          columns={cols}
          rowKey="id"
          loading={loading}
          pagination={paginate ? { pageSize: 20 } : false}
          className="erp-pro-table erp-users-table"
          onRow={(row) => ({
            onClick: () => openEvaluation(row),
            style: { cursor: 'pointer' },
          })}
        />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'needs-action',
      label: (
        <span className="inline-flex items-center gap-1.5">
          Needs My Action
          {needsDLAction.length > 0 ? (
            <Badge count={needsDLAction.length} size="small" />
          ) : null}
        </span>
      ),
      children: renderTable(
        needsDLAction,
        columns,
        dlEvaluationsQuery.isLoading,
        'No evaluations need your action',
      ),
    },
    {
      key: 'team-lead',
      label: (
        <span className="inline-flex items-center gap-1.5">
          As Team Lead
          {needsTLAction.length > 0 ? (
            <Badge count={needsTLAction.length} size="small" />
          ) : null}
        </span>
      ),
      children: renderTable(
        tlEvaluations,
        tlColumns,
        tlEvaluationsQuery.isLoading,
        'No evaluations assigned to you as Team Lead',
      ),
    },
    {
      key: 'awaiting-employee',
      label: `Awaiting (${dlByStatus.awaitingEmployee.length})`,
      children: renderTable(
        dlByStatus.awaitingEmployee,
        columns,
        false,
        'No evaluations awaiting employee response',
      ),
    },
    {
      key: 'escalated',
      label: (
        <span className="inline-flex items-center gap-1.5">
          Escalated
          {dlByStatus.escalated.length > 0 ? (
            <Badge
              count={dlByStatus.escalated.length}
              color="red"
              size="small"
            />
          ) : null}
        </span>
      ),
      children: renderTable(
        dlByStatus.escalated,
        columns,
        false,
        'No escalated evaluations',
      ),
    },
    {
      key: 'in-progress',
      label: `In Progress (${dlByStatus.inProgress.length})`,
      children: renderTable(
        dlByStatus.inProgress,
        columns,
        false,
        'No in-progress evaluations',
      ),
    },
    {
      key: 'completed',
      label: `Completed (${dlByStatus.completed.length})`,
      children: renderTable(
        dlByStatus.completed,
        columns,
        false,
        'No completed evaluations',
        true,
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page">
      <div className="erp-users-stat-bar">
        <EvaluationStat
          label="Needs Action"
          value={totalNeedsAction}
          accent="amber"
          icon={<ExclamationCircleOutlined />}
          active={activeTab === 'needs-action'}
          onClick={() => setActiveTab('needs-action')}
        />
        <EvaluationStat
          label="Team Lead Queue"
          value={needsTLAction.length}
          accent="blue"
          icon={<TeamOutlined />}
          active={activeTab === 'team-lead'}
          onClick={() => setActiveTab('team-lead')}
        />
        <EvaluationStat
          label="Escalated"
          value={dlByStatus.escalated.length}
          accent="red"
          icon={<WarningOutlined />}
          active={activeTab === 'escalated'}
          onClick={() => setActiveTab('escalated')}
        />
        <EvaluationStat
          label="Completed"
          value={dlByStatus.completed.length}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">My Evaluation Inbox</h3>
            {totalNeedsAction > 0 ? (
              <span className="erp-users-count-pill">
                {totalNeedsAction} action
                {totalNeedsAction === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="erp-users-count-pill">
                <ClockCircleOutlined className="mr-1" />
                Up to date
              </span>
            )}
          </div>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          className="erp-evaluation-inbox-tabs px-4 pt-2"
        />
      </div>
    </div>
  );
}
