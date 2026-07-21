'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Divider, Empty, Pagination, Select, Space, Switch } from 'antd';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import type {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  MyWorkItem,
} from '@/lib/api/epc.types';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
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
import ApprovedCrRevisionBanner from '@/components/modules/projects/change-requests/ApprovedCrRevisionBanner';

const TASKS_PER_PAGE = 20;

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

interface TaskWorkGroup {
  taskId: string;
  taskName: string;
  taskIdCode: string;
  overseasTaskNumber: string | null;
  projectId: string;
  projectName: string;
  projectNumber: string;
  responsiblePersonItem: MyWorkItem | null;
  disciplineLeadItems: MyWorkItem[];
  subtaskItems: MyWorkItem[];
}

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
        return reviewModeHref(item.projectId, item.taskDisciplineId, item.designPackageId);
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

function compareDisciplineIndex(left: MyWorkItem, right: MyWorkItem): number {
  const leftIndex = left.disciplineIndex ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.disciplineIndex ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex;
}

function compareSubtaskId(left: MyWorkItem, right: MyWorkItem): number {
  const leftCode = left.subtaskId ?? left.packageCode ?? '';
  const rightCode = right.subtaskId ?? right.packageCode ?? '';
  return leftCode.localeCompare(rightCode);
}

function groupItemsByTask(items: MyWorkItem[]): TaskWorkGroup[] {
  const groups = new Map<string, TaskWorkGroup>();

  for (const item of items) {
    let group = groups.get(item.taskId);
    if (!group) {
      group = {
        taskId: item.taskId,
        taskName: item.taskName,
        taskIdCode: item.taskIdCode,
        overseasTaskNumber: item.overseasTaskNumber,
        projectId: item.projectId,
        projectName: item.projectName,
        projectNumber: item.projectNumber,
        responsiblePersonItem: null,
        disciplineLeadItems: [],
        subtaskItems: [],
      };
      groups.set(item.taskId, group);
    }

    if (item.kind === 'RESPONSIBLE_PERSON') {
      group.responsiblePersonItem = item;
    } else if (item.kind === 'DISCIPLINE_LEAD') {
      group.disciplineLeadItems.push(item);
    } else if (item.kind === 'SUBTASK_ROLE') {
      group.subtaskItems.push(item);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      disciplineLeadItems: [...group.disciplineLeadItems].sort(compareDisciplineIndex),
      subtaskItems: [...group.subtaskItems].sort(compareSubtaskId),
    }))
    .sort((left, right) => {
      const projectCompare = left.projectName.localeCompare(right.projectName);
      if (projectCompare !== 0) {
        return projectCompare;
      }
      return left.taskName.localeCompare(right.taskName);
    });
}

function matchesCardSearch(group: TaskWorkGroup, term: string): boolean {
  if (!term) {
    return true;
  }
  const taskName = group.taskName.toLowerCase();
  const projectName = group.projectName.toLowerCase();
  return taskName.includes(term) || projectName.includes(term);
}

function subtaskStatusDisplay(
  item: MyWorkItem,
): { label: string; variant: StatusBadgeVariant } | null {
  if (item.projectedStatus) {
    const status = item.projectedStatus as DesignPackageProjectedStatus;
    return {
      label: PROJECTED_STATUS_LABELS[status] ?? item.projectedStatus.replace(/_/g, ' '),
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

function disciplineHeading(item: MyWorkItem): string {
  return `Discipline ${formatDisciplineNumber(item.disciplineIndex)} — ${item.disciplineName}`;
}

function ResponsiblePersonSection({ item }: { item: MyWorkItem }): React.ReactNode {
  return (
    <>
      <Divider className="!my-4" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <StatusBadge label="Responsible person" variant="info" />
          <p className="mt-2 text-xs text-slate-500">
            Read-only access to all subtasks and documents
          </p>
        </div>
        <Link href={workItemHref(item)}>
          <Button type="link" className="!px-0">
            Open task →
          </Button>
        </Link>
      </div>
    </>
  );
}

function DisciplineLeadSection({
  item,
  onAddSubtask,
}: {
  item: MyWorkItem;
  onAddSubtask: (taskDisciplineId: string) => void;
}): React.ReactNode {
  const subtaskCount = item.subtaskCount ?? 0;

  return (
    <>
      <Divider className="!my-4" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-slate-900">{disciplineHeading(item)}</p>
          <p className="text-xs text-slate-500">You lead this discipline</p>
          <p className="text-xs text-slate-500">
            {subtaskCount} subtask{subtaskCount === 1 ? '' : 's'}
          </p>
        </div>
        <Space wrap>
          <Link href={scheduleDisciplineWorkspaceHref(item.projectId, item.taskDisciplineId)}>
            <Button>View discipline</Button>
          </Link>
          <Button type="primary" onClick={() => onAddSubtask(item.taskDisciplineId)}>
            Add subtask
          </Button>
        </Space>
      </div>
    </>
  );
}

function SubtaskRoleSection({ item }: { item: MyWorkItem }): React.ReactNode {
  const subtaskCode = item.subtaskId ?? item.packageCode;
  const status = subtaskStatusDisplay(item);

  return (
    <>
      <Divider className="!my-4" />
      {item.designPackageId ? (
        <ApprovedCrRevisionBanner
          projectId={item.projectId}
          designPackageId={item.designPackageId}
          packageStatus={item.packageStatus}
          embedDrawer
        />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">{disciplineHeading(item)}</p>
          <p className="font-medium text-slate-900">{item.subtaskName}</p>
          {subtaskCode ? <p className="text-xs text-slate-500">{subtaskCode}</p> : null}
          {item.roleLabel ? (
            <p className="text-xs text-slate-500">Your role: {item.roleLabel}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {status ? <StatusBadge label={status.label} variant={status.variant} /> : null}
          <Link href={workItemHref(item)}>
            <Button type="link" className="!px-0">
              Open →
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

function TaskWorkCard({
  group,
  showSubtasks,
  onAddSubtask,
}: {
  group: TaskWorkGroup;
  showSubtasks: boolean;
  onAddSubtask: (taskDisciplineId: string) => void;
}): React.ReactNode {
  const taskCode = group.overseasTaskNumber ?? group.taskIdCode;

  return (
    <Card
      size="small"
      className="border border-slate-200 shadow-sm"
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-900">{group.taskName}</p>
          {taskCode ? <p className="text-xs text-slate-500">{taskCode}</p> : null}
        </div>
        <div className="sm:text-right">
          <p className="font-medium text-slate-900">{group.projectName}</p>
          <p className="text-xs text-slate-500">{group.projectNumber}</p>
        </div>
      </div>

      {group.responsiblePersonItem ? (
        <ResponsiblePersonSection item={group.responsiblePersonItem} />
      ) : null}

      {group.disciplineLeadItems.map((item) => (
        <DisciplineLeadSection
          key={item.taskDisciplineId}
          item={item}
          onAddSubtask={onAddSubtask}
        />
      ))}

      {showSubtasks
        ? group.subtaskItems.map((item) => (
            <SubtaskRoleSection
              key={item.designPackageId ?? item.taskDisciplineId}
              item={item}
            />
          ))
        : null}
    </Card>
  );
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
  const [page, setPage] = useState(1);

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

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (!showSubtasks && item.kind === 'SUBTASK_ROLE') {
        return false;
      }
      if (projectFilter && item.projectId !== projectFilter) {
        return false;
      }
      if (statusFilter && item.projectedStatus !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [allItems, projectFilter, showSubtasks, statusFilter]);

  const taskGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const groups = groupItemsByTask(filteredItems);
    return groups.filter((group) => matchesCardSearch(group, term));
  }, [filteredItems, search]);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * TASKS_PER_PAGE;
    return taskGroups.slice(start, start + TASKS_PER_PAGE);
  }, [page, taskGroups]);

  useEffect(() => {
    setPage(1);
  }, [search, projectFilter, statusFilter, showSubtasks, projectId]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(taskGroups.length / TASKS_PER_PAGE));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, taskGroups.length]);

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
            placeholder="Search task or project…"
            className="w-full max-w-xs"
            committedValue={search}
            onCommit={setSearch}
          />
          {!projectId ? (
            <Select
              allowClear
              showSearch
              placeholder="Project"
              className="w-full min-w-[160px] sm:w-48"
              options={projectOptions}
              value={projectFilter}
              onChange={(value: string | undefined) => setProjectFilter(value)}
              optionFilterProp="label"
            />
          ) : null}
          <Select
            allowClear
            placeholder="Status"
            className="w-full min-w-[140px] sm:w-40"
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

      {taskGroups.length === 0 ? (
        <Empty description="No work assigned to you yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedGroups.map((group) => (
            <TaskWorkCard
              key={group.taskId}
              group={group}
              showSubtasks={showSubtasks}
              onAddSubtask={setAddSubtaskFor}
            />
          ))}

          {taskGroups.length > TASKS_PER_PAGE ? (
            <div className="flex justify-end pt-2">
              <Pagination
                current={page}
                pageSize={TASKS_PER_PAGE}
                total={taskGroups.length}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          ) : null}
        </div>
      )}

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
