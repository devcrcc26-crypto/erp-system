'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Select, Space, Switch } from 'antd';
import { CheckSquare } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import ApprovedCrRevisionBanner from '@/components/modules/projects/change-requests/ApprovedCrRevisionBanner';
import type {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  MyWorkItem,
  MyWorkItemKind,
} from '@/lib/api/epc.types';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import {
  reviewModeHref,
  scheduleDisciplineWorkspaceHref,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_VARIANTS,
  PROJECTED_STATUS_LABELS,
  PROJECTED_STATUS_VARIANTS,
} from '@/lib/utils/epc-display';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';

const PROJECTED_STATUS_OPTIONS: DesignPackageProjectedStatus[] = [
  'IN_PROGRESS',
  'PENDING_LEAD',
  'APPROVED',
  'REWORK_REQUIRED',
  'LOCKED',
];

const STATUS_FILTER_OPTIONS = PROJECTED_STATUS_OPTIONS.map((status) => ({
  value: status,
  label: PROJECTED_STATUS_LABELS[status],
}));

const REVIEWER_TIER_ROLES = new Set([
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
]);

const KIND_LABELS: Record<MyWorkItemKind, string> = {
  RESPONSIBLE_PERSON: 'Task lead',
  DISCIPLINE_LEAD: 'Discipline lead',
  SUBTASK_ROLE: 'Subtask',
};

const KIND_VARIANTS: Record<MyWorkItemKind, StatusBadgeVariant> = {
  RESPONSIBLE_PERSON: 'info',
  DISCIPLINE_LEAD: 'orange',
  SUBTASK_ROLE: 'default',
};

const KIND_SORT_ORDER: Record<MyWorkItemKind, number> = {
  RESPONSIBLE_PERSON: 0,
  DISCIPLINE_LEAD: 1,
  SUBTASK_ROLE: 2,
};

function workItemHref(item: MyWorkItem): string {
  if (item.kind === 'DISCIPLINE_LEAD') {
    return scheduleDisciplineWorkspaceHref(
      item.projectId,
      item.taskDisciplineId,
    );
  }

  if (item.kind === 'RESPONSIBLE_PERSON') {
    return `/projects/${item.projectId}/schedule/tasks/${item.taskId}`;
  }

  if (item.kind === 'SUBTASK_ROLE' && item.designPackageId) {
    if (item.primaryRole && REVIEWER_TIER_ROLES.has(item.primaryRole)) {
      if (item.packageStatus === 'SUBMITTED') {
        return reviewModeHref(
          item.projectId,
          item.taskDisciplineId,
          item.designPackageId,
        );
      }
      return scheduleSubtaskWorkspaceHref(
        item.projectId,
        item.taskDisciplineId,
        item.designPackageId,
      );
    }
    return scheduleSubtaskWorkspaceHref(
      item.projectId,
      item.taskDisciplineId,
      item.designPackageId,
    );
  }

  return '/my-work';
}

function rowKey(item: MyWorkItem): string {
  return [
    item.kind,
    item.projectId,
    item.taskId,
    item.taskDisciplineId,
    item.designPackageId ?? '',
    item.primaryRole ?? '',
  ].join(':');
}

function compareWorkItems(left: MyWorkItem, right: MyWorkItem): number {
  const projectCompare = left.projectName.localeCompare(right.projectName);
  if (projectCompare !== 0) {
    return projectCompare;
  }
  const taskCompare = left.taskName.localeCompare(right.taskName);
  if (taskCompare !== 0) {
    return taskCompare;
  }
  const kindCompare = KIND_SORT_ORDER[left.kind] - KIND_SORT_ORDER[right.kind];
  if (kindCompare !== 0) {
    return kindCompare;
  }
  const leftDiscipline = left.disciplineIndex ?? Number.MAX_SAFE_INTEGER;
  const rightDiscipline = right.disciplineIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftDiscipline !== rightDiscipline) {
    return leftDiscipline - rightDiscipline;
  }
  const leftSubtask = left.subtaskId ?? left.packageCode ?? '';
  const rightSubtask = right.subtaskId ?? right.packageCode ?? '';
  return leftSubtask.localeCompare(rightSubtask);
}

function matchesSearch(item: MyWorkItem, term: string): boolean {
  if (!term) {
    return true;
  }
  const haystack = [
    item.projectName,
    item.projectNumber,
    item.taskName,
    item.taskIdCode,
    item.overseasTaskNumber,
    item.disciplineName,
    item.subtaskName,
    item.subtaskId,
    item.packageCode,
    item.roleLabel,
    KIND_LABELS[item.kind],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function subtaskStatusDisplay(
  item: MyWorkItem,
): { label: string; variant: StatusBadgeVariant } | null {
  if (item.projectedStatus) {
    const status = item.projectedStatus as DesignPackageProjectedStatus;
    return {
      label:
        PROJECTED_STATUS_LABELS[status] ??
        item.projectedStatus.replace(/_/g, ' '),
      variant: PROJECTED_STATUS_VARIANTS[status] ?? 'info',
    };
  }

  if (item.packageStatus) {
    const status = item.packageStatus as DesignPackageStatus;
    return {
      label: PACKAGE_STATUS_LABELS[status] ?? item.packageStatus,
      variant: PACKAGE_STATUS_VARIANTS[status] ?? 'default',
    };
  }

  return null;
}

function disciplineLabel(item: MyWorkItem): string {
  if (item.kind === 'RESPONSIBLE_PERSON') {
    return '—';
  }
  return `Discipline ${formatDisciplineNumber(item.disciplineIndex)} — ${item.disciplineName}`;
}

export default function MyWorkPageContent({
  projectId,
}: {
  projectId?: string;
} = {}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewMyWork = useCanViewMyWork();
  const workQuery = useMyWork(projectId);
  const { t } = useEpcTranslation();
  const [addSubtaskFor, setAddSubtaskFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<
    DesignPackageProjectedStatus | undefined
  >();
  const [showSubtasks, setShowSubtasks] = useState(true);

  const allItems = workQuery.data ?? [];

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of allItems) {
      seen.set(item.projectId, item.projectName);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [allItems]);

  const tableRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems
      .filter((item) => {
        if (!showSubtasks && item.kind === 'SUBTASK_ROLE') {
          return false;
        }
        if (projectFilter && item.projectId !== projectFilter) {
          return false;
        }
        if (statusFilter && item.projectedStatus !== statusFilter) {
          return false;
        }
        return matchesSearch(item, term);
      })
      .sort(compareWorkItems);
  }, [allItems, projectFilter, search, showSubtasks, statusFilter]);

  const columns: ColumnsType<MyWorkItem> = useMemo(() => {
    const cols: ColumnsType<MyWorkItem> = [];

    if (!projectId) {
      cols.push({
        title: 'Project',
        key: 'project',
        render: (_: unknown, record) => {
          const code = record.projectNumber?.trim();
          const name = record.projectName?.trim();
          if (code && name) {
            return `${code} — ${name}`;
          }
          return name || code || '—';
        },
      });
    }

    cols.push(
      {
        title: 'Task',
        key: 'task',
        render: (_: unknown, record) => {
          const code = record.overseasTaskNumber ?? record.taskIdCode;
          return (
            <div>
              <div className="font-medium text-slate-900">{record.taskName}</div>
              {code ? (
                <div className="text-xs text-slate-500">{code}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: 'Type',
        dataIndex: 'kind',
        key: 'kind',
        width: 140,
        render: (kind: MyWorkItemKind) => (
          <StatusBadge
            label={KIND_LABELS[kind]}
            variant={KIND_VARIANTS[kind]}
          />
        ),
      },
      {
        title: 'Discipline',
        key: 'discipline',
        ellipsis: true,
        render: (_: unknown, record) => disciplineLabel(record),
      },
      {
        title: 'Subtask',
        key: 'subtask',
        render: (_: unknown, record) => {
          if (record.kind !== 'SUBTASK_ROLE') {
            if (record.kind === 'DISCIPLINE_LEAD') {
              const count = record.subtaskCount ?? 0;
              return (
                <span className="text-xs text-slate-500">
                  {count} subtask{count === 1 ? '' : 's'}
                </span>
              );
            }
            return '—';
          }
          const code = record.subtaskId ?? record.packageCode;
          return (
            <div>
              <div className="font-medium text-slate-900">
                {record.subtaskName ?? '—'}
              </div>
              {code ? (
                <div className="text-xs text-slate-500">{code}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: 'Your role',
        dataIndex: 'roleLabel',
        key: 'role',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: 'Status',
        key: 'status',
        width: 140,
        render: (_: unknown, record) => {
          const status = subtaskStatusDisplay(record);
          return status ? (
            <StatusBadge label={status.label} variant={status.variant} />
          ) : (
            '—'
          );
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        fixed: 'right',
        width: 200,
        render: (_: unknown, record) => (
          <Space wrap size="small">
            <Link href={workItemHref(record)}>
              <Button type="link" className="!px-0" size="small">
                Open
              </Button>
            </Link>
            {record.kind === 'DISCIPLINE_LEAD' ? (
              <Button
                type="link"
                className="!px-0"
                size="small"
                onClick={() => setAddSubtaskFor(record.taskDisciplineId)}
              >
                Add subtask
              </Button>
            ) : null}
          </Space>
        ),
      },
    );

    return cols;
  }, [projectId]);

  useEffect(() => {
    setProjectFilter(undefined);
  }, [projectId]);

  if (permLoading || workQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewMyWork) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to assigned work."
      />
    );
  }

  const activeItem = workQuery.data?.find(
    (item) => item.taskDisciplineId === addSubtaskFor,
  );

  return (
    <FormLayout
      title={t('pages.myWork.title')}
      description="Tasks you lead and subtasks where you hold a role."
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ListSearchInput
            live
            placeholder="Search task, project, discipline, subtask…"
            className={layout.filterControl}
            committedValue={search}
            onCommit={setSearch}
          />
          {!projectId ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className={layout.filterControlSm}
              options={projectOptions}
              value={projectFilter}
              onChange={(value: string | undefined) => setProjectFilter(value)}
              optionFilterProp="label"
            />
          ) : null}
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlSm}
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(value: DesignPackageProjectedStatus | undefined) =>
              setStatusFilter(value)
            }
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <Switch
            size="small"
            checked={showSubtasks}
            onChange={setShowSubtasks}
          />
          Show subtasks
        </label>
      </div>

      <DataTable<MyWorkItem>
        rowKey={rowKey}
        columns={columns}
        dataSource={tableRows}
        expandable={{
          expandedRowRender: (record) => {
            if (
              record.kind !== 'SUBTASK_ROLE' ||
              !record.designPackageId
            ) {
              return null;
            }
            return (
              <ApprovedCrRevisionBanner
                projectId={record.projectId}
                designPackageId={record.designPackageId}
                packageStatus={record.packageStatus}
                embedDrawer
              />
            );
          },
          rowExpandable: (record) =>
            record.kind === 'SUBTASK_ROLE' && Boolean(record.designPackageId),
          expandRowByClick: false,
        }}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<CheckSquare />}
              title="No work assigned to you yet."
            />
          ),
        }}
      />

      {addSubtaskFor && activeItem ? (
        <DesignPackageBuilder
          open={true}
          projectId={activeItem.projectId}
          taskDisciplineId={addSubtaskFor}
          editing={null}
          onClose={() => setAddSubtaskFor(null)}
          onSaved={() => {
            void workQuery.refetch();
            setAddSubtaskFor(null);
          }}
        />
      ) : null}
    </FormLayout>
  );
}
