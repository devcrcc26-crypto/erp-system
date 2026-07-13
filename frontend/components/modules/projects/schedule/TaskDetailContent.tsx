'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Collapse, Descriptions, Modal, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ScheduleSubtaskStatusBadge from '@/components/modules/projects/schedule/ScheduleSubtaskStatusBadge';
import SubtaskRolesModal from '@/components/modules/projects/design-packages/SubtaskRolesModal';
import type { DesignPackage } from '@/lib/api/epc.types';
import type { Task, TaskDiscipline } from '@/lib/api/project-management.types';
import type { User } from '@/lib/api/types';
import type { ScheduleSubtaskEntry } from '@/lib/query/schedule';
import {
  useTaskDisciplines,
  useScheduleSubtasks,
  useUpdateTaskDiscipline,
} from '@/lib/query/schedule';
import { useProjectTeam } from '@/lib/query/projects';
import { useFullUsersDirectory } from '@/lib/query/users';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import { useAuthStore } from '@/stores/auth.store';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName, formatUserPickerLabel } from '@/lib/utils/user-display';
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
  computeTaskSubtaskWorkDaysSummary,
  getScheduleSubtaskDisplayStatus,
  scheduleDisciplineWorkspaceHref,
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

type DisciplineTimelineRow =
  | { rowType: 'discipline'; key: string; discipline: TaskDiscipline }
  | {
      rowType: 'subtask';
      key: string;
      discipline: TaskDiscipline;
      entry: ScheduleSubtaskEntry;
    }
  | { rowType: 'empty'; key: string; discipline: TaskDiscipline };

const UNIFIED_TIMELINE_COLUMN_COUNT = 7;

/**
 * Discipline header and empty-state rows merge into a single full-width
 * cell (first column spans all, the rest are hidden) so the unified table
 * reads as grouped sections rather than a flat list.
 */
function mergedRowCell(
  row: DisciplineTimelineRow,
  isFirstColumn: boolean,
): { colSpan?: number } {
  if (row.rowType === 'subtask') {
    return {};
  }
  return isFirstColumn
    ? { colSpan: UNIFIED_TIMELINE_COLUMN_COUNT }
    : { colSpan: 0 };
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
  const teamQuery = useProjectTeam(projectId);
  const disciplinesQuery = useTaskDisciplines(projectId, task.id);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(projectId);
  const usersQuery = useFullUsersDirectory();
  const updateTaskDiscipline = useUpdateTaskDiscipline();
  const messageApi = useAppMessage();
  const [rolesSubtask, setRolesSubtask] = useState<{
    package: DesignPackage;
    taskDisciplineId: string;
  } | null>(null);
  const [editingDiscipline, setEditingDiscipline] =
    useState<TaskDiscipline | null>(null);
  const [selectedLeaderId, setSelectedLeaderId] = useState<
    string | undefined
  >(undefined);
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

  const packagesByDisciplineId = useMemo(() => {
    const map = new Map<string, ScheduleSubtaskEntry[]>();
    for (const entry of subtasks) {
      const existing = map.get(entry.taskDisciplineId) ?? [];
      existing.push(entry);
      map.set(entry.taskDisciplineId, existing);
    }
    return map;
  }, [subtasks]);

  const leaderOptions = useMemo(() => {
    if (!editingDiscipline) {
      return [];
    }
    const matching = users.filter(
      (user) =>
        user.isActive &&
        user.engineeringDisciplineId === editingDiscipline.disciplineId,
    );
    const pool = matching.length > 0 ? matching : users.filter((user) => user.isActive);
    return pool.map((user) => ({
      value: user.id,
      label: formatUserPickerLabel(user),
    }));
  }, [users, editingDiscipline]);

  function openChangeLeaderModal(discipline: TaskDiscipline): void {
    setEditingDiscipline(discipline);
    setSelectedLeaderId(discipline.disciplineLeadUserId ?? undefined);
  }

  const unifiedRows = useMemo<DisciplineTimelineRow[]>(() => {
    const rows: DisciplineTimelineRow[] = [];
    for (const discipline of disciplines) {
      rows.push({
        rowType: 'discipline',
        key: `discipline-${discipline.id}`,
        discipline,
      });
      const packages = packagesByDisciplineId.get(discipline.id) ?? [];
      if (packages.length === 0) {
        rows.push({ rowType: 'empty', key: `empty-${discipline.id}`, discipline });
        continue;
      }
      const sorted = [...packages].sort((a, b) =>
        (a.package.subtaskId ?? a.package.packageCode).localeCompare(
          b.package.subtaskId ?? b.package.packageCode,
        ),
      );
      for (const entry of sorted) {
        rows.push({
          rowType: 'subtask',
          key: entry.package.id,
          discipline,
          entry,
        });
      }
    }
    return rows;
  }, [disciplines, packagesByDisciplineId]);

  const unifiedColumns: ColumnsType<DisciplineTimelineRow> = [
    {
      title: 'Subtask ID',
      key: 'subtaskId',
      onCell: (row) => mergedRowCell(row, true),
      render: (_value, row) => {
        if (row.rowType === 'discipline') {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={scheduleDisciplineWorkspaceHref(projectId, row.discipline.id)}
                className="text-[14px] font-medium hover:text-[#D4610A]"
              >
                {formatDisciplineLabel(row.discipline.disciplineIndex)}
              </Link>
              <span
                className="text-[12px]"
                style={{ color: tokens.colorTextSecondary }}
              >
                Leader: {resolveDisciplineLeaderName(row.discipline, userById)}
              </span>
            </div>
          );
        }
        if (row.rowType === 'empty') {
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="text-[12px]"
                style={{ color: tokens.colorTextTertiary }}
              >
                No subtasks yet — discipline leader will create subtasks and
                assign work
              </span>
              <Button
                type="link"
                size="small"
                className="!px-0 text-[12px]"
                onClick={() => openChangeLeaderModal(row.discipline)}
              >
                Change leader
              </Button>
            </div>
          );
        }
        return row.entry.package.subtaskId ?? row.entry.package.packageCode;
      },
    },
    {
      title: 'Subtask name',
      key: 'name',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) =>
        row.rowType === 'subtask' ? (
          <div>
            <div className="text-[13px] font-medium">{row.entry.package.name}</div>
            {row.entry.package.nameZh ? (
              <div
                className="text-[12px]"
                style={{ color: tokens.colorTextSecondary }}
              >
                {row.entry.package.nameZh}
              </div>
            ) : null}
          </div>
        ) : null,
    },
    {
      title: 'Planned start',
      key: 'plannedStartDate',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) =>
        row.rowType === 'subtask'
          ? row.entry.package.plannedStartDate
            ? formatProjectDate(row.entry.package.plannedStartDate)
            : '-'
          : null,
    },
    {
      title: 'Planned finish',
      key: 'plannedFinishDate',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) =>
        row.rowType === 'subtask'
          ? row.entry.package.plannedFinishDate
            ? formatProjectDate(row.entry.package.plannedFinishDate)
            : '-'
          : null,
    },
    {
      title: 'Actual work days',
      key: 'actualWorkDays',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) =>
        row.rowType === 'subtask'
          ? row.entry.package.packageStatus === 'CLOSED' &&
            row.entry.package.actualWorkDays != null
            ? row.entry.package.actualWorkDays
            : '-'
          : null,
    },
    {
      title: 'Status',
      key: 'status',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) =>
        row.rowType === 'subtask' ? (
          <ScheduleSubtaskStatusBadge
            status={getScheduleSubtaskDisplayStatus(row.entry.package)}
          />
        ) : null,
    },
    {
      title: '',
      key: 'actions',
      onCell: (row) => mergedRowCell(row, false),
      render: (_value, row) => {
        if (row.rowType !== 'subtask') {
          return null;
        }
        const showEditSubtaskRoles = canEditSubtaskRoles(
          row.discipline,
          currentUserId,
          isSystemAdministrator,
        );
        return (
          <div className="flex items-center justify-end gap-2">
            {showEditSubtaskRoles && (
              <Button
                type="link"
                size="small"
                className="!px-0 text-[12px]"
                onClick={() =>
                  setRolesSubtask({
                    package: row.entry.package,
                    taskDisciplineId: row.entry.taskDisciplineId,
                  })
                }
              >
                Edit roles
              </Button>
            )}
            <Button
              type="link"
              size="small"
              className="!px-0 text-[12px]"
              onClick={() => openChangeLeaderModal(row.discipline)}
            >
              Change leader
            </Button>
          </div>
        );
      },
    },
  ];

  async function handleChangeLeader(): Promise<void> {
    if (!editingDiscipline || !selectedLeaderId) {
      messageApi.error('Select a new leader');
      return;
    }

    try {
      // Only updates TaskDiscipline.disciplineLeadUserId — who can create
      // subtasks under this discipline and close it. Independent from
      // DesignPackage.disciplinaryLeaderUserId (per-subtask review role),
      // which is managed separately via "Edit roles" on each subtask.
      await updateTaskDiscipline.mutateAsync({
        projectId,
        taskId: task.id,
        disciplineId: editingDiscipline.id,
        body: { disciplineLeadUserId: selectedLeaderId },
      });
      await disciplinesQuery.refetch();
      messageApi.success('Discipline leader updated');
      setEditingDiscipline(null);
      setSelectedLeaderId(undefined);
    } catch (error) {
      notifyApiError(error, 'Failed to update discipline leader', messageApi);
    }
  }

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

      <FormLayout title="Disciplines & Timeline">
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
          <>
            <Table<DisciplineTimelineRow>
              rowKey="key"
              size="small"
              columns={unifiedColumns}
              dataSource={unifiedRows}
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

      <Modal
        open={Boolean(editingDiscipline)}
        title={`Change discipline leader — ${editingDiscipline ? formatDisciplineLabel(editingDiscipline.disciplineIndex) : ''}`}
        okText="Save"
        confirmLoading={updateTaskDiscipline.isPending}
        onCancel={() => {
          setEditingDiscipline(null);
          setSelectedLeaderId(undefined);
        }}
        onOk={() => void handleChangeLeader()}
        destroyOnHidden
      >
        {editingDiscipline && (
          <div className="flex flex-col gap-3">
            <p
              className="text-[13px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              Current: {resolveDisciplineLeaderName(editingDiscipline, userById)}
            </p>
            <Select
              className="w-full"
              showSearch
              placeholder="Select new leader"
              value={selectedLeaderId}
              onChange={setSelectedLeaderId}
              loading={usersQuery.isLoading}
              options={leaderOptions}
              optionFilterProp="label"
            />
          </div>
        )}
      </Modal>

    </div>
  );
}
