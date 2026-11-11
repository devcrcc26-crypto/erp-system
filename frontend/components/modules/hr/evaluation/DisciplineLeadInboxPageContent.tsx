'use client';

import './evaluation-v2.css';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dropdown,
  Grid,
  Input,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import { useEvaluations } from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import { formatUserName } from '@/lib/utils/user-display';
import EvaluationListAvatar from './EvaluationListAvatar';
import EvaluationStat from './EvaluationStat';

type InboxQueue =
  | 'needs-action'
  | 'team-lead'
  | 'awaiting'
  | 'escalated'
  | 'in-progress'
  | 'completed';

type InboxRole = 'discipline-lead' | 'team-lead';

interface InboxRow extends EmployeeEvaluation {
  inboxRole?: InboxRole;
}

const STAGE_ORDER = ['SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD'] as const;
const STAGE_LABELS = ['Self', 'Team Lead', 'DL'] as const;

const QUEUE_META: Record<
  InboxQueue,
  { title: string; emptyTitle: string; emptyDescription: string }
> = {
  'needs-action': {
    title: 'Needs My Action',
    emptyTitle: 'Nothing needs your action',
    emptyDescription:
      'When Team Lead or Discipline Lead assessments are waiting on you, they will show up here.',
  },
  'team-lead': {
    title: 'As Team Lead',
    emptyTitle: 'No Team Lead assignments',
    emptyDescription:
      'Evaluations where you are the Team Lead will appear in this queue.',
  },
  awaiting: {
    title: 'Awaiting Employee',
    emptyTitle: 'No evaluations awaiting employees',
    emptyDescription:
      'Shared results waiting for employee accept or dispute will appear here.',
  },
  escalated: {
    title: 'Escalated to HR',
    emptyTitle: 'No escalated evaluations',
    emptyDescription:
      'Disputes escalated to HR for a final decision will appear here.',
  },
  'in-progress': {
    title: 'In Progress',
    emptyTitle: 'No evaluations in progress',
    emptyDescription:
      'Draft or early-stage evaluations assigned to you will appear here.',
  },
  completed: {
    title: 'Completed',
    emptyTitle: 'No completed evaluations',
    emptyDescription:
      'Accepted, HR-decided, and locked evaluations will appear here.',
  },
};

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

function matchesSearch(row: EmployeeEvaluation, q: string): boolean {
  if (!q) {
    return true;
  }
  const name =
    formatUserName(row.employee).toLowerCase();
  const empId = (row.employee.employeeId ?? '').toLowerCase();
  return name.includes(q) || empId.includes(q);
}

export default function DisciplineLeadInboxPageContent(): React.ReactNode {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const [queue, setQueue] = useState<InboxQueue>('needs-action');
  const [search, setSearch] = useState('');

  const dlEvaluationsQuery = useEvaluations({ disciplineLeadId: 'me' });
  const tlEvaluationsQuery = useEvaluations({ teamLeadId: 'me' });

  const dlEvaluations = dlEvaluationsQuery.data ?? [];
  const tlEvaluations = tlEvaluationsQuery.data ?? [];
  const isLoading =
    dlEvaluationsQuery.isLoading || tlEvaluationsQuery.isLoading;
  const isFetching =
    dlEvaluationsQuery.isFetching || tlEvaluationsQuery.isFetching;
  const hasData =
    dlEvaluationsQuery.data !== undefined ||
    tlEvaluationsQuery.data !== undefined;

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

  const needsActionRows = useMemo((): InboxRow[] => {
    const asDl: InboxRow[] = needsDLAction.map((ev) => ({
      ...ev,
      inboxRole: 'discipline-lead' as const,
    }));
    const asTl: InboxRow[] = needsTLAction.map((ev) => ({
      ...ev,
      inboxRole: 'team-lead' as const,
    }));
    return [...asDl, ...asTl];
  }, [needsDLAction, needsTLAction]);

  const queues = useMemo(
    () => ({
      'needs-action': needsActionRows,
      'team-lead': tlEvaluations as InboxRow[],
      awaiting: dlEvaluations.filter((ev) =>
        ['RESULT_SHARED', 'DL_UPHELD', 'DL_ADJUSTED'].includes(ev.status),
      ) as InboxRow[],
      escalated: dlEvaluations.filter(
        (ev) => ev.status === 'ESCALATED',
      ) as InboxRow[],
      'in-progress': dlEvaluations.filter((ev) =>
        ['PENDING', 'SELF_ASSESSED'].includes(ev.status),
      ) as InboxRow[],
      completed: dlEvaluations.filter((ev) =>
        ['ACCEPTED', 'HR_DECIDED', 'LOCKED'].includes(ev.status),
      ) as InboxRow[],
    }),
    [needsActionRows, tlEvaluations, dlEvaluations],
  );

  const totalNeedsAction = needsDLAction.length + needsTLAction.length;
  const searchQ = search.trim().toLowerCase();
  const activeRows = queues[queue].filter((row) =>
    matchesSearch(row, searchQ),
  );
  const meta = QUEUE_META[queue];
  const showRoleColumn = queue === 'needs-action';

  function buildActionMenu(row: InboxRow): MenuProps['items'] {
    return [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: 'View',
        onClick: () => router.push(`/hr/evaluations/${row.id}`),
      },
    ];
  }

  const columns: ColumnsType<InboxRow> = useMemo(() => {
    const cols: ColumnsType<InboxRow> = [
      {
        title: 'Employee',
        key: 'employee',
        width: isCompact ? 220 : 260,
        render: (_value, row) => {
          const fullName =
            formatUserName(row.employee);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <EvaluationListAvatar
                firstName={row.employee.firstName}
                lastName={row.employee.lastName}
                userId={row.employee.id}
              />
              <div className="min-w-0 flex-1">
                <p className="erp-users-name m-0 truncate">{fullName}</p>
                {row.employee.employeeId ? (
                  <span className="erp-users-id-chip mt-1 inline-block">
                    {row.employee.employeeId}
                  </span>
                ) : (
                  <p className="erp-users-email m-0 mt-0.5">-</p>
                )}
              </div>
            </div>
          );
        },
      },
    ];

    if (showRoleColumn) {
      cols.push({
        title: 'Your Role',
        key: 'inboxRole',
        width: 140,
        render: (_value, row) =>
          row.inboxRole === 'discipline-lead' ? (
            <StatusBadge label="Discipline Lead" variant="info" />
          ) : (
            <StatusBadge label="Team Lead" variant="cyan" />
          ),
      });
    }

    cols.push(
      {
        title: 'Cycle',
        key: 'cycle',
        width: 150,
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
        width: 160,
        render: (_value, row) => (
          <StatusBadge
            label={EVALUATION_STATUS_LABELS[row.status]}
            variant={EVALUATION_STATUS_BADGE[row.status]}
          />
        ),
      },
      {
        title: 'Score',
        key: 'score',
        width: 140,
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
        title: 'Disputes',
        key: 'disputes',
        width: 100,
        responsive: ['lg'],
        render: (_value, row) =>
          (row._count?.disputes ?? 0) > 0 ? (
            <StatusBadge
              label={`${row._count?.disputes}`}
              variant="warning"
            />
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
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
    );

    return cols;
  }, [showRoleColumn, isCompact, router]);

  async function handleRefresh(): Promise<void> {
    await Promise.all([
      dlEvaluationsQuery.refetch(),
      tlEvaluationsQuery.refetch(),
    ]);
  }

  function handleResetSearch(): void {
    setSearch('');
  }

  if (isLoading && !hasData) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-inbox-page erp-evaluation-v2">
        <div className="erp-evaluation-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-inbox-page erp-evaluation-v2">
      <div className="erp-users-stat-bar erp-evaluation-inbox-stats">
        <EvaluationStat
          label="Needs Action"
          value={totalNeedsAction}
          accent="amber"
          icon={<ExclamationCircleOutlined />}
          active={queue === 'needs-action'}
          onClick={() => setQueue('needs-action')}
        />
        <EvaluationStat
          label="Team Lead"
          value={needsTLAction.length}
          accent="blue"
          icon={<TeamOutlined />}
          active={queue === 'team-lead'}
          onClick={() => setQueue('team-lead')}
        />
        <EvaluationStat
          label="Awaiting"
          value={queues.awaiting.length}
          accent="teal"
          icon={<FieldTimeOutlined />}
          active={queue === 'awaiting'}
          onClick={() => setQueue('awaiting')}
        />
        <EvaluationStat
          label="Escalated"
          value={queues.escalated.length}
          accent="red"
          icon={<WarningOutlined />}
          active={queue === 'escalated'}
          onClick={() => setQueue('escalated')}
        />
        <EvaluationStat
          label="In Progress"
          value={queues['in-progress'].length}
          accent="slate"
          icon={<ClockCircleOutlined />}
          active={queue === 'in-progress'}
          onClick={() => setQueue('in-progress')}
        />
        <EvaluationStat
          label="Completed"
          value={queues.completed.length}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={queue === 'completed'}
          onClick={() => setQueue('completed')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{meta.title}</h3>
            <span className="erp-users-count-pill">
              {activeRows.length.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title="Refresh">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={isFetching && !isLoading}
                onClick={() => void handleRefresh()}
                aria-label="Refresh"
              />
            </Tooltip>
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
            aria-label="Search by name or employee ID"
          />
          {search.trim() ? (
            <Button
              type="link"
              onClick={handleResetSearch}
              className="!px-1"
            >
              Reset
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<InboxRow>
            dataSource={activeRows}
            columns={columns}
            rowKey={(row) =>
              row.inboxRole ? `${row.id}-${row.inboxRole}` : row.id
            }
            loading={isLoading}
            pagination={{
              pageSize: 10,
              hideOnSinglePage: true,
              pageSizeOptions: ['10', '20', '50'],
              showSizeChanger: !isCompact,
            }}
            size={isCompact ? 'small' : 'middle'}
            className="erp-pro-table erp-users-table"
            scroll={{ x: isCompact ? 720 : 960 }}
            onRow={(row) => ({
              onClick: () => router.push(`/hr/evaluations/${row.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<InboxOutlined />}
                  title={
                    searchQ ? 'No matching evaluations' : meta.emptyTitle
                  }
                  description={
                    searchQ
                      ? 'Try a different name or employee ID, or clear the search.'
                      : meta.emptyDescription
                  }
                  action={
                    searchQ
                      ? {
                          label: 'Clear search',
                          onClick: handleResetSearch,
                        }
                      : undefined
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
