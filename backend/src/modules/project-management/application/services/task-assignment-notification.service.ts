import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  SUBTASK_ROLE_ASSIGNED_EVENT,
  SUBTASK_ROLE_LABELS,
  TASK_DISCIPLINE_LEADER_ASSIGNED_EVENT,
  type SubtaskRoleField,
} from '../constants/my-work.constants';
import { PmContext } from '../types/pm-context.type';

export type SubtaskRoleAssignment = {
  userId: string;
  roleField: SubtaskRoleField;
};

/**
 * Sends in-app notifications when discipline leaders or subtask roles are assigned.
 */
@Injectable()
export class TaskAssignmentNotificationService {
  private readonly logger = new Logger(TaskAssignmentNotificationService.name);

  constructor(
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Notifies a user they were assigned as discipline leader on a task.
   */
  async notifyDisciplineLeaderAssigned(
    ctx: PmContext,
    input: {
      recipientId: string | null | undefined;
      projectName: string;
      projectNumber: string;
      taskName: string;
      disciplineName: string;
      taskId: string;
      taskDisciplineId: string;
    },
  ): Promise<void> {
    if (!input.recipientId || input.recipientId === ctx.userId) {
      return;
    }
    if (!this.notificationService) {
      return;
    }

    const subject = `Discipline leader assigned - ${input.disciplineName}`;
    const body = [
      `You were assigned as discipline leader on ${input.disciplineName}.`,
      `Project: ${input.projectName} (${input.projectNumber})`,
      `Task: ${input.taskName}`,
    ].join('\n');

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: input.recipientId,
          eventType: TASK_DISCIPLINE_LEADER_ASSIGNED_EVENT,
          subject,
          body,
          variables: {
            projectName: input.projectName,
            projectNumber: input.projectNumber,
            taskName: input.taskName,
            disciplineName: input.disciplineName,
            taskId: input.taskId,
            taskDisciplineId: input.taskDisciplineId,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify discipline leader assignment for task ${input.taskId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Notifies users newly assigned to subtask roles.
   */
  async notifySubtaskRolesAssigned(
    ctx: PmContext,
    input: {
      projectName: string;
      projectNumber: string;
      taskName: string;
      disciplineName: string;
      subtaskName: string;
      designPackageId: string;
      assignments: SubtaskRoleAssignment[];
    },
  ): Promise<void> {
    if (!this.notificationService || input.assignments.length === 0) {
      return;
    }

    for (const assignment of input.assignments) {
      if (assignment.userId === ctx.userId) {
        continue;
      }

      const roleLabel = SUBTASK_ROLE_LABELS[assignment.roleField];
      const subject = `Subtask role assigned - ${roleLabel}`;
      const body = [
        `You were assigned as ${roleLabel} on subtask "${input.subtaskName}".`,
        `Discipline: ${input.disciplineName}`,
        `Project: ${input.projectName} (${input.projectNumber})`,
        `Task: ${input.taskName}`,
      ].join('\n');

      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId: assignment.userId,
            eventType: SUBTASK_ROLE_ASSIGNED_EVENT,
            subject,
            body,
            variables: {
              roleLabel,
              subtaskName: input.subtaskName,
              disciplineName: input.disciplineName,
              projectName: input.projectName,
              projectNumber: input.projectNumber,
              taskName: input.taskName,
              designPackageId: input.designPackageId,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to notify subtask role ${assignment.roleField} on package ${input.designPackageId}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
