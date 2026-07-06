'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Collapse, Descriptions } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
import DisciplineDetailDrawer from '@/components/modules/projects/disciplines/DisciplineDetailDrawer';
import SubtaskRolesModal from '@/components/modules/projects/design-packages/SubtaskRolesModal';
import type { DesignPackage } from '@/lib/api/epc.types';
import type { Task, TaskDiscipline } from '@/lib/api/project-management.types';
import type { ScheduleSubtaskEntry } from '@/lib/query/schedule';
import {
  useTaskDisciplines,
  useScheduleSubtasks,
} from '@/lib/query/schedule';
import { useProjectTeam } from '@/lib/query/projects';
import { useAuthStore } from '@/stores/auth.store';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import {
  formatProjectDate,
  formatProjectDesignStage,
} from '@/lib/utils/project-display';
import { formatDisciplineDateTime } from '@/components/modules/projects/disciplines/discipline-form.util';
import { formatTaskStatus, taskStatusVariant } from '@/lib/utils/pm-status-display';
import {
  formatArchivingLabel,
  formatTaskAttributesLabel,
  formatTaskReviewLevelLabel,
  formatUrgencyLevelLabel,
  urgencyBadgeVariant,
} from '@/lib/constants/task-comment8';
import {
  getScheduleSubtaskDisplayStatus,
  scheduleDisciplineWorkspaceHref,
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
  isSystemAdministrator: boolean,
): boolean {
  if (isSystemAdministrator) {
    return true;
  }
  return discipline.disciplineLeadUserId === currentUserId;
}

function canAddTaskDiscipline(
  task: Task,
  currentUserId: string | undefined,
  isSystemAdministrator: boolean,
  canEditSchedule: boolean,
): boolean {
  if (isSystemAdministrator) {
    return true;
  }
  if (task.dispatcherUserId && task.dispatcherUserId === currentUserId) {
    return true;
  }
  return canEditSchedule;
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
  const pm = usePmCapabilities();
  const teamQuery = useProjectTeam(projectId);
  const disciplinesQuery = useTaskDisciplines(projectId, task.id);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(projectId);
  const [rolesSubtask, setRolesSubtask] = useState<{
    package: DesignPackage;
    taskDisciplineId: string;
  } | null>(null);
  const [addDisciplineOpen, setAddDisciplineOpen] = useState(false);

  const leaderNameById = useMemo(
    () =>
      new Map(
        (teamQuery.data ?? [])
          .filter((member) => member.userName)
          .map((member) => [member.userId, member.userName as string]),
      ),
    [teamQuery.data],
  );

  const disciplines = disciplinesQuery.data ?? [];
  const subtasks = subtasksByTaskId.get(task.id) ?? [];

  const packagesByDisciplineId = useMemo(() => {
    const map = new Map<string, ScheduleSubtaskEntry[]>();
    for (const entry of subtasks) {
      const existing = map.get(entry.taskDisciplineId) ?? [];
      existing.push(entry);
      map.set(entry.taskDisciplineId, existing);
    }
    return map;
  }, [subtasks]);

  const showAddDiscipline = canAddTaskDiscipline(
    task,
    currentUserId,
    isSystemAdministrator,
    pm.schedule.canEdit,
  );

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
              {formatLocalizedName(task)}
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
                    label: 'Supervising chief',
                    children: resolveTeamMemberName(
                      leaderNameById,
                      task.supervisingChiefUserId,
                    ),
                  },
                  {
                    key: 'site',
                    label: 'On-site receiving time',
                    children: formatDisciplineDateTime(task.onSiteReceivingTime),
                  },
                  {
                    key: 'hq',
                    label: 'HQ assignment time',
                    children: formatDisciplineDateTime(task.assignmentToHqTime),
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

      <FormLayout
        title="Disciplines & subtasks"
        extra={
          showAddDiscipline ? (
            <Button
              type="link"
              size="small"
              className="!px-0"
              onClick={() => setAddDisciplineOpen(true)}
            >
              + Add discipline
            </Button>
          ) : undefined
        }
      >
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
          <ul className="space-y-4">
            {disciplines.map((discipline) => {
              const packages =
                packagesByDisciplineId.get(discipline.id) ?? [];
              const showEditSubtaskRoles = canEditSubtaskRoles(
                discipline,
                currentUserId,
                isSystemAdministrator,
              );
              const workspaceHref = scheduleDisciplineWorkspaceHref(
                projectId,
                discipline.id,
              );

              return (
                <li
                  key={discipline.id}
                  className="rounded-lg border px-4 py-3"
                  style={{ borderColor: tokens.colorBorder }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">
                          {discipline.disciplineName}
                        </span>
                        <Link href={workspaceHref}>
                          <Button
                            type="text"
                            size="small"
                            aria-label="Open discipline workspace"
                            icon={<ArrowRightOutlined />}
                          />
                        </Link>
                      </div>
                      <p
                        className="mt-1 text-[12px]"
                        style={{ color: tokens.colorTextSecondary }}
                      >
                        Leader: {discipline.disciplinaryLeader ?? 'Unassigned'}
                        {' · '}
                        Designer: {discipline.designerName ?? 'Unassigned'}
                      </p>
                    </div>
                  </div>

                  {packages.length === 0 ? (
                    <p
                      className="mt-3 text-[12px]"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      No subtasks yet — discipline leader will create subtasks
                      and assign work
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {packages.map((entry) => {
                        const displayStatus = getScheduleSubtaskDisplayStatus(
                          entry.package,
                        );
                        const packageHref = scheduleSubtaskWorkspaceHref(
                          projectId,
                          entry.taskDisciplineId,
                          entry.package.id,
                        );

                        return (
                          <li key={entry.package.id}>
                            <div
                              className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                              style={{ borderColor: tokens.colorBorder }}
                            >
                              <Link
                                href={packageHref}
                                className="min-w-0 flex-1 transition-colors hover:text-[#D4610A]"
                              >
                                <span className="text-[13px]">
                                  {entry.package.name}
                                </span>
                              </Link>
                              <div className="flex shrink-0 items-center gap-2">
                                {showEditSubtaskRoles && (
                                  <Button
                                    type="link"
                                    size="small"
                                    className="!px-0 text-[12px]"
                                    onClick={() =>
                                      setRolesSubtask({
                                        package: entry.package,
                                        taskDisciplineId: entry.taskDisciplineId,
                                      })
                                    }
                                  >
                                    Edit roles
                                  </Button>
                                )}
                                <ScheduleSubtaskStatusBadge
                                  status={displayStatus}
                                />
                                <Link href={packageHref}>
                                  <ArrowRightOutlined
                                    className="text-[12px]"
                                    style={{ color: tokens.colorTextTertiary }}
                                  />
                                </Link>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FormLayout>

      <SubtaskRolesModal
        open={Boolean(rolesSubtask)}
        projectId={projectId}
        taskDisciplineId={rolesSubtask?.taskDisciplineId ?? ''}
        subtask={rolesSubtask?.package ?? null}
        onClose={() => setRolesSubtask(null)}
        onSaved={() => {
          void disciplinesQuery.refetch();
        }}
      />

      <DisciplineDetailDrawer
        open={addDisciplineOpen}
        projectId={projectId}
        taskId={task.id}
        discipline={null}
        onClose={() => setAddDisciplineOpen(false)}
        onSaved={() => {
          void disciplinesQuery.refetch();
        }}
      />
    </div>
  );
}
