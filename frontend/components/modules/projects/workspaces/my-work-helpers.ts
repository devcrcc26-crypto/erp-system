import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  MyWorkItem,
  MyWorkItemKind,
} from '@/lib/api/epc.types';
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

export const PROJECTED_STATUS_OPTIONS: DesignPackageProjectedStatus[] = [
  'IN_PROGRESS',
  'PENDING_LEAD',
  'APPROVED',
  'REWORK_REQUIRED',
  'LOCKED',
];

export const STATUS_FILTER_OPTIONS = PROJECTED_STATUS_OPTIONS.map((status) => ({
  value: status,
  label: PROJECTED_STATUS_LABELS[status],
}));

export const REVIEWER_TIER_ROLES = new Set([
  'REVIEWER',
  'DISCIPLINE_LEAD',
  'DEPT_CHIEF',
  'INSTITUTE_CHIEF',
]);

export const KIND_LABELS: Record<MyWorkItemKind, string> = {
  RESPONSIBLE_PERSON: 'Task lead',
  DISCIPLINE_LEAD: 'Discipline lead',
  SUBTASK_ROLE: 'Subtask',
};

export const KIND_VARIANTS: Record<MyWorkItemKind, StatusBadgeVariant> = {
  RESPONSIBLE_PERSON: 'info',
  DISCIPLINE_LEAD: 'orange',
  SUBTASK_ROLE: 'default',
};

const KIND_SORT_ORDER: Record<MyWorkItemKind, number> = {
  RESPONSIBLE_PERSON: 0,
  DISCIPLINE_LEAD: 1,
  SUBTASK_ROLE: 2,
};

export function workItemHref(item: MyWorkItem): string {
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

export function compareWorkItems(left: MyWorkItem, right: MyWorkItem): number {
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

export function matchesSearch(item: MyWorkItem, term: string): boolean {
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

export function subtaskStatusDisplay(
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

export function projectLabel(item: MyWorkItem): string {
  const code = item.projectNumber?.trim();
  const name = item.projectName?.trim();
  if (code && name) {
    return `${code} - ${name}`;
  }
  return name || code || '-';
}
