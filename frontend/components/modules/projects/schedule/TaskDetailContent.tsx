'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Collapse, Descriptions, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowRightOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import DisciplineBuilder from '@/components/modules/projects/disciplines/DisciplineBuilder';
import type { DesignPackage } from '@/lib/api/epc.types';
import type { Task, TaskDiscipline } from '@/lib/api/project-management.types';
import type { User } from '@/lib/api/types';
import type { ScheduleSubtaskEntry } from '@/lib/query/schedule';
import {
  useTaskDisciplines,
  useScheduleSubtasks,
} from '@/lib/query/schedule';
import { useProjectTeam } from '@/lib/query/projects';
import { useFullUsersDirectory } from '@/lib/query/users';
import { resolveDisciplineDisplayLabel } from '@/lib/utils/discipline-number';
import { useAuthStore } from '@/stores/auth.store';
import { useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import { formatUserName } from '@/lib/utils/user-display';
import { canManageSubtaskAsDisciplineLeader } from '@/lib/utils/subtask-permissions';
import {
  formatProjectDate,
  formatProjectDesignStage,
} from '@/lib/utils/project-display';
import {
  formatDisciplineDate,
  formatDisciplineDateTime,
} from '@/components/modules/projects/disciplines/discipline-form.util';
import { formatTaskStatus, taskStatusVariant } from '@/lib/utils/pm-status-display';
import {
  formatArchivingLabel,
  formatTaskAttributesLabel,
  formatTaskReviewLevelLabel,
  formatUrgencyLevelLabel,
  urgencyBadgeVariant,
} from '@/lib/constants/task-comment8';
import {
  computePlannedWorkDaysFromDates,
  computeTaskSubtaskWorkDaysSummary,
  getScheduleSubtaskDisplayStatus,
  scheduleSubtaskWorkspaceHref,
} from '@/lib/utils/schedule-subtasks';
import { formatCommissionModeLabel } from '@/lib/constants/commission-mode';
import { tokens } from '@/lib/theme/tokens';

function resolveTeamMemberName(
  nameById: Map<string, string>,
  userId: string | null | undefined,
): string {
  if (!userId) {
    return '-';
  }
  return nameById.get(userId) ?? 'Unknown';
}

function canEditSubtaskRoles(
  discipline: TaskDiscipline,
  currentUserId: string | undefined,
  hasElevatedAccess: boolean,
): boolean {
  return canManageSubtaskAsDisciplineLeader(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
}

function canCreateSubtaskOnDiscipline(
  discipline: TaskDiscipline,
  currentUserId: string | undefined,
  hasElevatedAccess: boolean,
): boolean {
  return canManageSubtaskAsDisciplineLeader(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
}

/**
 * Resolves the discipline leader's full name from the company directory,
 * falling back to the deprecated display-name string when the live user
 * record isn't found (e.g. deactivated since assignment).
 */
function resolveDisciplineLeaderName(
  discipline: TaskDiscipline,
  userById: Map<string, User>,
): string {
  if (discipline.disciplineLeadUserId) {
    const user = userById.get(discipline.disciplineLeadUserId);
    if (user) {
      return formatUserName(user);
    }
  }
  return discipline.disciplinaryLeader ?? 'Unassigned';
}

export default function TaskDetailContent({
  projectId,
  projectName,
  projectNumber,
  task,
  onEdit,
}: {
  projectId: string;
  projectName?: string;
  projectNumber?: string;
  task: Task;
  onEdit?: () => void;
}): React.ReactNode {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const epc = useEpcCapabilities();
  const hasElevatedAccess = isSystemAdministrator || epc.navFullAccess;
  const teamQuery = useProjectTeam(projectId);
  const disciplinesQuery = useTaskDisciplines(projectId, task.id);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(projectId);
  const usersQuery = useFullUsersDirectory();
  const [subtaskBuilder, setSubtaskBuilder] = useState<{
    taskDisciplineId: string;
    editing: DesignPackage | null;
  } | null>(null);
  const [editingDiscipline, setEditingDiscipline] =
    useState<TaskDiscipline | null>(null);
  const leaderNameById = useMemo(
    () =>
      new Map(
        (teamQuery.data ?? [])
          .filter((member) => member.userName)
          .map((member) => [member.userId, member.userName as string]),
      ),
    [teamQuery.data],
  );

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const disciplines = disciplinesQuery.data ?? [];
  const subtasks = subtasksByTaskId.get(task.id) ?? [];

  const timelineSummary = useMemo(
    () =>
      computeTaskSubtaskWorkDaysSummary(
        subtasks.map((entry) => entry.package),
      ),
    [subtasks],
  );

  const disciplineByTaskDisciplineId = useMemo(
    () => new Map(disciplines.map((discipline) => [discipline.id, discipline])),
    [disciplines],
  );

  const subtaskRows = useMemo(
    () =>
      [...subtasks].sort((a, b) =>
        (a.package.subtaskId ?? a.package.packageCode).localeCompare(
          b.package.subtaskId ?? b.package.packageCode,
        ),
      ),
    [subtasks],
  );

  const eligibleDisciplinesForCreate = useMemo(
    () =>
      disciplines.filter((discipline) =>
        canCreateSubtaskOnDiscipline(
          discipline,
          currentUserId,
          hasElevatedAccess,
        ),
      ),
    [disciplines, currentUserId, hasElevatedAccess],
  );

  const showAddSubtask =
    !disciplinesQuery.isLoading && eligibleDisciplinesForCreate.length > 0;

  const disciplinePickerOptions = useMemo(
    () =>
      eligibleDisciplinesForCreate.map((discipline) => ({
        value: discipline.id,
        label: resolveDisciplineDisplayLabel(discipline),
      })),
    [eligibleDisciplinesForCreate],
  );

  function openSubtaskBuilder(
    taskDisciplineId: string,
    editing: DesignPackage | null,
  ): void {
    setSubtaskBuilder({ taskDisciplineId, editing });
  }

  function handleAddSubtask(): void {
    const taskDisciplineId =
      eligibleDisciplinesForCreate.length === 1
        ? eligibleDisciplinesForCreate[0].id
        : '';
    openSubtaskBuilder(taskDisciplineId, null);
  }

  const disciplineColumns: ColumnsType<TaskDiscipline> = [
    {
      title: 'Discipline',
      key: 'disciplineNumber',
      render: (_value, discipline) => resolveDisciplineDisplayLabel(discipline),
    },
    {
      title: 'Current leader',
      key: 'leader',
      render: (_value, discipline) =>
        resolveDisciplineLeaderName(discipline, userById),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_value, discipline) => (
        <Button
          type="link"
          size="small"
          className="!px-0"
          onClick={() => setEditingDiscipline(discipline)}
        >
          Edit
        </Button>
      ),
    },
  ];

  const subtaskColumns: ColumnsType<ScheduleSubtaskEntry> = [
    {
      title: 'Subtask ID',
      key: 'subtaskId',
      render: (_value, entry) =>
        entry.package.subtaskId ?? entry.package.packageCode,
    },
    {
      title: 'Subtask name',
      key: 'name',
      render: (_value, entry) => (
        <div>
          <div className="text-[13px] font-medium">{entry.package.name}</div>
          {entry.package.nameZh ? (
            <div
              className="text-[12px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {entry.package.nameZh}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Discipline',
      key: 'disciplineNumber',
      render: (_value, entry) => {
        const discipline = disciplineByTaskDisciplineId.get(entry.taskDisciplineId);
        return discipline ? resolveDisciplineDisplayLabel(discipline) : '-';
      },
    },
    {
      title: 'Planned start',
      key: 'plannedStartDate',
      render: (_value, entry) =>
        entry.package.plannedStartDate
          ? formatProjectDate(entry.package.plannedStartDate)
          : '-',
    },
    {
      title: 'Planned work days',
      key: 'plannedWorkDays',
      align: 'right',
      render: (_value, entry) => {
        const days = computePlannedWorkDaysFromDates(
          entry.package.plannedStartDate,
          entry.package.plannedFinishDate,
        );
        return days != null ? days : '-';
      },
    },
    {
      title: 'Actual work days',
      key: 'actualWorkDays',
      render: (_value, entry) =>
        entry.package.packageStatus === 'CLOSED' &&
        entry.package.actualWorkDays != null
          ? entry.package.actualWorkDays
          : '-',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value, entry) => (
        <ScheduleSubtaskStatusBadge
          status={getScheduleSubtaskDisplayStatus(entry.package)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_value, entry) => {
        const discipline = disciplineByTaskDisciplineId.get(entry.taskDisciplineId);
        const showEditSubtaskRoles = discipline
          ? canEditSubtaskRoles(discipline, currentUserId, hasElevatedAccess)
          : false;
        const packageHref = scheduleSubtaskWorkspaceHref(
          projectId,
          entry.taskDisciplineId,
          entry.package.id,
        );
        return (
          <div className="flex items-center justify-end gap-2">
            {showEditSubtaskRoles && (
              <Button
                type="link"
                size="small"
                className="!px-0 text-[12px]"
                onClick={() =>
                  openSubtaskBuilder(entry.taskDisciplineId, entry.package)
                }
              >
                Edit subtask
              </Button>
            )}
            <Link href={packageHref}>
              <ArrowRightOutlined
                className="text-[12px]"
                style={{ color: tokens.colorTextTertiary }}
              />
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {projectName && (
              <p
                className="text-[12px] font-medium uppercase tracking-wide"
                style={{ color: tokens.colorTextSecondary }}
              >
                {projectName}
                {projectNumber ? ` · ${projectNumber}` : ''}
              </p>
            )}
            <h2 className="text-[18px] font-semibold">
              {task.name}
            </h2>
            {task.nameZh && (
              <p
                className="mt-0.5 text-[13px]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {task.nameZh}
              </p>
            )}
          </div>
          {onEdit && (
            <Button type="primary" onClick={onEdit}>
              Edit task
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={formatTaskStatus(task.status)}
            variant={taskStatusVariant(task.status)}
          />
          <StatusBadge
            label={formatUrgencyLevelLabel(task.urgencyLevel)}
            variant={urgencyBadgeVariant(task.urgencyLevel)}
          />
          {task.designStage && (
            <StatusBadge
              label={formatProjectDesignStage(task.designStage)}
              variant="default"
            />
          )}
        </div>

        <Descriptions
          className="mt-4"
          column={{ xs: 1, sm: 2 }}
          size="small"
          items={[
            {
              key: 'overseas',
              label: 'Overseas task number',
              children: task.overseasTaskNumber || '-',
            },
            {
              key: 'due',
              label: 'Due date',
              children: formatProjectDate(task.finishDate),
            },
            {
              key: 'commission',
              label: 'Commission mode',
              children: task.commissionMode
                ? formatCommissionModeLabel(task.commissionMode)
                : '-',
            },
            {
              key: 'dispatcher',
              label: 'Dispatcher (调度员)',
              children: resolveTeamMemberName(
                leaderNameById,
                task.dispatcherUserId,
              ),
            },
          ]}
        />
      </div>

      <Collapse
        bordered={false}
        className="erp-schedule-collapse bg-transparent"
        items={[
          {
            key: 'details',
            label: 'Task details',
            children: (
              <Descriptions
                column={{ xs: 1, sm: 2 }}
                size="small"
                items={[
                  {
                    key: 'description',
                    label: 'Main work content',
                    children: task.description || '-',
                    span: 2,
                  },
                  {
                    key: 'attributes',
                    label: 'Task attributes',
                    children: formatTaskAttributesLabel(task.taskAttributes),
                  },
                  {
                    key: 'urgency',
                    label: 'Urgency level',
                    children: formatUrgencyLevelLabel(task.urgencyLevel),
                  },
                  {
                    key: 'review',
                    label: 'Task review level',
                    children: formatTaskReviewLevelLabel(task.approvalLevel),
                  },
                  {
                    key: 'archiving',
                    label: 'Form of archiving',
                    children: formatArchivingLabel(task.requiresArchiving),
                  },
                  {
                    key: 'language',
                    label: 'Language',
                    children:
                      task.language === 'CHINESE' ? 'Chinese' : 'English',
                  },
                  {
                    key: 'workPlan',
                    label: 'Work plan made',
                    children: task.hasCustomSchedule ? 'Yes' : 'No',
                  },
                  {
                    key: 'contact',
                    label: 'Contact sheet number',
                    children: task.contactFormNumber || '-',
                  },
                  {
                    key: 'chief',
                    label: 'Responsible Person',
                    children: resolveTeamMemberName(
                      leaderNameById,
                      task.supervisingChiefUserId,
                    ),
                  },
                  {
                    key: 'site',
                    label: 'On-site receiving time',
                    children: formatDisciplineDate(task.onSiteReceivingTime),
                  },
                  {
                    key: 'hq',
                    label: 'HQ assignment time',
                    children: formatDisciplineDate(task.assignmentToHqTime),
                  },
                  {
                    key: 'planned',
                    label: 'Planned completion',
                    children: formatProjectDate(task.finishDate),
                  },
                  {
                    key: 'actual',
                    label: 'Actual completion',
                    children: formatDisciplineDateTime(task.actualCompletionTime),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <FormLayout title="Disciplines">
        {disciplinesQuery.isLoading ? (
          <div className="erp-page-skeleton h-20 w-full rounded" />
        ) : disciplines.length === 0 ? (
          <p
            className="text-[13px]"
            style={{ color: tokens.colorTextSecondary }}
          >
            No disciplines assigned yet. Edit this task to assign discipline
            leaders.
          </p>
        ) : (
          <Table<TaskDiscipline>
            rowKey="id"
            size="small"
            columns={disciplineColumns}
            dataSource={disciplines}
            scroll={{ x: 'max-content' }}
            pagination={false}
          />
        )}
      </FormLayout>

      <FormLayout
        title="Subtasks"
        extra={
          showAddSubtask ? (
            <Button
              type="link"
              size="small"
              className="!px-0"
              onClick={handleAddSubtask}
            >
              + Add subtask
            </Button>
          ) : undefined
        }
      >
        {subtasks.length === 0 ? (
          <p
            className="text-[13px]"
            style={{ color: tokens.colorTextSecondary }}
          >
            No subtasks yet - planned and actual work days will appear here once
            subtasks are created.
          </p>
        ) : (
          <>
            <Table<ScheduleSubtaskEntry>
              rowKey={(entry) => entry.package.id}
              size="small"
              columns={subtaskColumns}
              dataSource={subtaskRows}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
            <div
              className="mt-4 space-y-1 text-[13px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              <p>
                <span className="font-medium text-slate-700">
                  Total planned work days:
                </span>{' '}
                {timelineSummary.totalPlannedWorkDays != null
                  ? timelineSummary.totalPlannedWorkDays
                  : '-'}
              </p>
              <p>
                <span className="font-medium text-slate-700">
                  Total actual work days:
                </span>{' '}
                {timelineSummary.totalActualWorkDays != null
                  ? timelineSummary.totalActualWorkDays
                  : '-'}
              </p>
            </div>
          </>
        )}
      </FormLayout>

      <DesignPackageBuilder
        key={
          subtaskBuilder
            ? `${subtaskBuilder.editing?.id ?? 'new'}-${subtaskBuilder.taskDisciplineId}`
            : 'closed'
        }
        open={Boolean(subtaskBuilder)}
        projectId={projectId}
        taskDisciplineId={subtaskBuilder?.taskDisciplineId ?? ''}
        editing={subtaskBuilder?.editing ?? null}
        disciplineChoices={
          subtaskBuilder?.editing ? undefined : disciplinePickerOptions
        }
        onClose={() => setSubtaskBuilder(null)}
        onSaved={() => {
          void disciplinesQuery.refetch();
        }}
      />

      <DisciplineBuilder
        open={Boolean(editingDiscipline)}
        projectId={projectId}
        taskId={task.id}
        discipline={editingDiscipline}
        onClose={() => setEditingDiscipline(null)}
        onSaved={() => {
          void disciplinesQuery.refetch();
        }}
      />

    </div>
  );
}
