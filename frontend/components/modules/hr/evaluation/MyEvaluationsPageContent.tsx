'use client';

import './evaluation-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Select,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  FileTextOutlined,
  MoreOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import type {
  EmployeeEvaluation,
  EvaluationStatus,
} from '@/lib/api/evaluation.types';
import {
  useEvaluations,
  useMyEvaluations,
} from '@/lib/query/evaluation';
import {
  calendarYearsInContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import EvaluationTrendChart from './EvaluationTrendChart';

const ACTION_STATUSES: EvaluationStatus[] = [
  'PENDING',
  'RESULT_SHARED',
  'DL_UPHELD',
  'DL_ADJUSTED',
];

const COMPLETED_STATUSES: EvaluationStatus[] = [
  'ACCEPTED',
  'LOCKED',
  'HR_DECIDED',
];

const STAGE_ORDER = ['SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD'] as const;
const STAGE_LABELS = ['Self', 'Team Lead', 'DL'] as const;

interface MyEvaluationsPageContentProps {
  /** When viewing another employee (HR), pass their user id. */
  employeeId?: string;
  /** When set, only evaluations whose cycle year overlaps this contract. */
  contractPeriod?: ProfileContractPeriod | null;
}

function StageProgress({
  evaluation,
}: {
  evaluation: EmployeeEvaluation;
}): React.ReactNode {
  const assessments = evaluation.assessments ?? [];
  return (
    <div className="min-w-[120px]">
      <div className="erp-evaluation-stage-bar">
        {STAGE_ORDER.map((stage) => {
          const done = assessments.some(
            (a) => a.stage === stage && a.submittedAt !== null,
          );
          return (
            <div
              key={stage}
              className={`erp-evaluation-stage-seg${
                done ? ' erp-evaluation-stage-seg--done' : ''
              }`}
            />
          );
        })}
      </div>
      <div className="erp-evaluation-stage-labels">
        {STAGE_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

export default function MyEvaluationsPageContent({
  employeeId,
  contractPeriod = null,
}: MyEvaluationsPageContentProps = {}): React.ReactNode {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const [yearFilter, setYearFilter] = useState<number | ''>('');

  const myQuery = useMyEvaluations();
  const employeeQuery = useEvaluations(
    employeeId ? { employeeId } : undefined,
    { enabled: Boolean(employeeId) },
  );

  const evaluationsQuery = employeeId ? employeeQuery : myQuery;

  const contractYears = useMemo(
    () =>
      contractPeriod
        ? new Set(calendarYearsInContractPeriod(contractPeriod))
        : null,
    [contractPeriod],
  );

  const evaluations = useMemo(() => {
    const rows = evaluationsQuery.data ?? [];
    if (!contractYears) {
      return rows;
    }
    return rows.filter((row) => contractYears.has(row.cycle.year));
  }, [evaluationsQuery.data, contractYears]);

  const years = useMemo(
    () =>
      [...new Set(evaluations.map((e) => e.cycle.year))].sort((a, b) => b - a),
    [evaluations],
  );

  const yearOptions = useMemo(
    () => [
      { value: '' as const, label: 'All Years' },
      ...years.map((y) => ({ value: y, label: String(y) })),
    ],
    [years],
  );

  const sorted = useMemo(() => {
    const filtered =
      yearFilter === ''
        ? evaluations
        : evaluations.filter((e) => e.cycle.year === yearFilter);

    return [...filtered].sort((a, b) => {
      if (b.cycle.year !== a.cycle.year) {
        return b.cycle.year - a.cycle.year;
      }
      return b.cycle.quarter - a.cycle.quarter;
    });
  }, [evaluations, yearFilter]);

  const needsAction = evaluations.filter((e) =>
    ACTION_STATUSES.includes(e.status),
  ).length;

  const completed = evaluations.filter((e) =>
    COMPLETED_STATUSES.includes(e.status),
  );

  function buildActionMenu(row: EmployeeEvaluation): MenuProps['items'] {
    return [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: 'View',
        onClick: () => router.push(`/hr/evaluations/${row.id}`),
      },
    ];
  }

  const columns: ColumnsType<EmployeeEvaluation> = [
    {
      title: 'Cycle',
      key: 'cycle',
      width: 160,
      render: (_value, row) => (
        <div className="min-w-0">
          <p className="erp-users-cell-strong m-0">
            {getQuarterLabel(row.cycle.quarter, row.cycle.year)}
          </p>
          <p className="erp-users-email m-0 mt-0.5">
            {getQuarterPeriodLabel(row.cycle.quarter, row.cycle.year)}
          </p>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 170,
      render: (_value, row) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge
            label={EVALUATION_STATUS_LABELS[row.status]}
            variant={EVALUATION_STATUS_BADGE[row.status]}
          />
          {ACTION_STATUSES.includes(row.status) ? (
            <StatusBadge label="Action Required" variant="info" />
          ) : null}
        </div>
      ),
    },
    {
      title: 'Score',
      key: 'score',
      width: 150,
      render: (_value, row) => {
        const score = row.adjustedScore ?? row.finalScore;
        if (score == null) {
          return <span className="erp-users-cell-sub">-</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <span
              className="font-semibold"
              style={{ color: getScoreColor(Number(score)) }}
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
      title: 'Progress',
      key: 'progress',
      width: 150,
      responsive: ['md'],
      render: (_value, row) => <StageProgress evaluation={row} />,
    },
    {
      title: '',
      key: 'actions',
      width: 52,
      align: 'right',
      render: (_value, row) => (
        <div
          className="erp-table-row-actions flex items-center justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: buildActionMenu(row) }}
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
      ),
    },
  ];

  if (evaluationsQuery.isLoading && !evaluationsQuery.data) {
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
      {completed.length >= 2 ? (
        <div className="erp-pro-card erp-evaluation-trend-card">
          <div className="erp-pro-card-body">
            <h4 className="erp-evaluation-trend-title">Performance Trend</h4>
            <EvaluationTrendChart evaluations={completed} />
          </div>
        </div>
      ) : null}

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {employeeId ? 'Evaluations' : 'My Evaluations'}
            </h3>
            {needsAction > 0 && !employeeId ? (
              <span className="erp-users-count-pill">
                {needsAction} action{needsAction === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="erp-users-count-pill">
                {sorted.length.toLocaleString()}
              </span>
            )}
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
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <p className="erp-users-email m-0 flex-1">
            {employeeId
              ? 'Quarterly performance evaluations for this employee'
              : 'Your quarterly performance evaluations'}
          </p>
          <Select
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
            className="erp-users-filter-select"
            aria-label="Filter by year"
          />
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EmployeeEvaluation>
            dataSource={sorted}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 10,
              hideOnSinglePage: true,
              pageSizeOptions: ['10', '20', '50'],
              showSizeChanger: !isCompact,
            }}
            size={isCompact ? 'small' : 'middle'}
            className="erp-pro-table erp-users-table"
            scroll={{ x: isCompact ? 560 : 720 }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/evaluations/${row.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<FileTextOutlined />}
                  title="No evaluations found"
                  description={
                    employeeId
                      ? 'This employee has no quarterly evaluations yet.'
                      : 'Your quarterly evaluations will appear here when a cycle is active.'
                  }
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
