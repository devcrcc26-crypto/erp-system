import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Project, Task } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  hasFullProjectDataAccess,
  hasProjectAdminAccess,
  isProjectAdministrator,
  isProjectAdminWritable,
} from '../../../../shared/permissions/project-admin.util';
import {
  disciplineAssigneeOr,
  subtaskRoleOr,
} from '../../domain/task-access-scope.util';
import { PmContext } from '../types/pm-context.type';

export interface TaskAccessProfile {
  hasFullProjectAccess: boolean;
  isProjectAdmin: boolean;
  /**
   * May create/manage subtasks and open the discipline workspace:
   * SysAdmin / Managing Director / Project Manager / Project Administrator.
   * Excludes Site Coordinator / Document Controller (project-admin-class readers).
   */
  canManageSubtasks: boolean;
  ledDepartmentIds: string[];
  isDepartmentLeader: boolean;
}

const NONE_ID = '__none__';

/**
 * Comment-8 phase 5 - server-side query scoping for projects, tasks, disciplines, and subtasks.
 * Out-of-scope reads return 404 (not 403).
 */
@Injectable()
export class TaskAccessScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Resolves the caller's data-access profile for project/task scoping.
   */
  async resolveProfile(ctx: PmContext): Promise<TaskAccessProfile> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const ledDepartments = await this.prisma.department.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        leaderUserId: ctx.userId,
      }),
      select: { id: true },
    });

    const hasFullProjectAccess = hasFullProjectDataAccess(roleNames);
    return {
      hasFullProjectAccess,
      isProjectAdmin: hasProjectAdminAccess(roleNames),
      canManageSubtasks:
        hasFullProjectAccess || isProjectAdministrator(roleNames),
      ledDepartmentIds: ledDepartments.map((row) => row.id),
      isDepartmentLeader: ledDepartments.length > 0,
    };
  }

  /**
   * Project IDs the user may list. Null means no id filter (full company project access).
   */
  async getVisibleProjectIds(ctx: PmContext): Promise<string[] | null> {
    const profile = await this.resolveProfile(ctx);
    if (profile.hasFullProjectAccess) {
      return null;
    }

    // Project Admin-class: all projects readable (write gated elsewhere).
    if (profile.isProjectAdmin) {
      return null;
    }

    const [
      departmentProjectIds,
      disciplineProjectIds,
      subtaskProjectIds,
    ] = await Promise.all([
      this.getDepartmentLeaderProjectIds(profile.ledDepartmentIds),
      this.getDisciplineScopedProjectIds(ctx),
      this.getSubtaskScopedProjectIds(ctx),
    ]);

    return [
      ...new Set([
        ...departmentProjectIds,
        ...disciplineProjectIds,
        ...subtaskProjectIds,
      ]),
    ];
  }

  /**
   * Merges list filters into a project where clause.
   */
  async buildProjectListWhere(
    ctx: PmContext,
    base: Prisma.ProjectWhereInput,
  ): Promise<Prisma.ProjectWhereInput> {
    const visibleIds = await this.getVisibleProjectIds(ctx);
    if (visibleIds === null) {
      return base;
    }
    return {
      AND: [
        base,
        { id: { in: visibleIds.length > 0 ? visibleIds : [NONE_ID] } },
      ],
    };
  }

  /**
   * Loads a project when readable; otherwise 404.
   */
  async assertProjectReadable(
    ctx: PmContext,
    projectId: string,
  ): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId: ctx.companyId }),
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const profile = await this.resolveProfile(ctx);
    if (profile.hasFullProjectAccess) {
      return project;
    }

    const visibleIds = await this.getVisibleProjectIds(ctx);
    // null = no id filter (full company or Project Admin-class read)
    if (visibleIds === null) {
      return project;
    }
    if (!visibleIds.includes(projectId)) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Prisma where fragment for task lists within a project.
   */
  async buildTaskListWhere(
    ctx: PmContext,
    projectId: string,
  ): Promise<Prisma.TaskWhereInput> {
    await this.assertProjectReadable(ctx, projectId);

    const profile = await this.resolveProfile(ctx);
    const base = activeOnly({ projectId });

    if (profile.hasFullProjectAccess || profile.isProjectAdmin) {
      return base;
    }

    const orConditions: Prisma.TaskWhereInput[] = [];

    if (profile.isDepartmentLeader) {
      orConditions.push({
        project: {
          departmentId: { in: profile.ledDepartmentIds },
        },
      });
    }

    orConditions.push({
      disciplines: {
        some: activeOnly({
          companyId: ctx.companyId,
          OR: disciplineAssigneeOr(ctx.userId),
        }),
      },
    });

    orConditions.push({
      disciplines: {
        some: activeOnly({
          companyId: ctx.companyId,
          designPackages: {
            some: activeOnly({
              companyId: ctx.companyId,
              OR: subtaskRoleOr(ctx.userId),
            }),
          },
        }),
      },
    });

    // Read-only: task responsible person sees their own tasks.
    orConditions.push({ supervisingChiefUserId: ctx.userId });

    return {
      AND: [base, { OR: orConditions }],
    };
  }

  /**
   * Loads a task when readable; otherwise 404.
   */
  async assertTaskReadable(
    ctx: PmContext,
    projectId: string,
    taskId: string,
  ): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: activeOnly({ id: taskId, projectId }),
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const listWhere = await this.buildTaskListWhere(ctx, projectId);
    const allowed = await this.prisma.task.findFirst({
      where: { AND: [activeOnly({ id: taskId, projectId }), listWhere] },
      select: { id: true },
    });
    if (!allowed) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  /**
   * Whether the user may mutate schedule/task fields (not subtask-role read-only).
   */
  async canWriteProjectTasks(ctx: PmContext, projectId: string): Promise<boolean> {
    const profile = await this.resolveProfile(ctx);
    if (profile.hasFullProjectAccess) {
      return true;
    }
    if (profile.isProjectAdmin) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({
          id: projectId,
          companyId: ctx.companyId,
        }),
        select: { createdBy: true },
      });
      return project
        ? isProjectAdminWritable(project, ctx.userId)
        : false;
    }
    return false;
  }

  /**
   * Prisma where fragment limiting disciplines within a project.
   */
  async buildDisciplineListWhere(
    ctx: PmContext,
    projectId: string,
  ): Promise<Prisma.TaskDisciplineWhereInput> {
    await this.assertProjectReadable(ctx, projectId);

    const profile = await this.resolveProfile(ctx);
    if (profile.hasFullProjectAccess || profile.isProjectAdmin) {
      return {};
    }

    const orConditions: Prisma.TaskDisciplineWhereInput[] = [
      { OR: disciplineAssigneeOr(ctx.userId) },
      {
        designPackages: {
          some: activeOnly({
            companyId: ctx.companyId,
            OR: subtaskRoleOr(ctx.userId),
          }),
        },
      },
      // Read-only: task responsible person sees all disciplines under their task.
      { task: { supervisingChiefUserId: ctx.userId } },
    ];

    if (profile.isDepartmentLeader) {
      orConditions.push({
        task: {
          project: {
            departmentId: { in: profile.ledDepartmentIds },
          },
        },
      });
    }

    return { OR: orConditions };
  }

  /**
   * Asserts discipline visibility; throws 404 when out of scope.
   */
  async assertDisciplineReadable(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    const scope = await this.buildDisciplineListWhere(ctx, projectId);
    const row = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
        ...scope,
      }),
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Task discipline not found');
    }
  }

  /**
   * Asserts the user may manage a discipline / create subtasks.
   * Allowed: discipline lead, System Admin, Managing Director, Project Manager,
   * Project Administrator. Approval-tier assignees and designers cannot.
   */
  async assertDisciplineWritable(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    const profile = await this.resolveProfile(ctx);
    if (profile.canManageSubtasks) {
      return;
    }

    const row = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        disciplineLeadUserId: ctx.userId,
        task: { projectId, deletedAt: null },
      }),
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Task discipline not found');
    }
  }

  /**
   * Prisma where fragment limiting design packages within a discipline.
   */
  async buildPackageListWhere(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<Prisma.DesignPackageWhereInput> {
    await this.assertDisciplineReadable(ctx, projectId, taskDisciplineId);

    const profile = await this.resolveProfile(ctx);
    if (profile.hasFullProjectAccess || profile.isProjectAdmin) {
      return {};
    }

    const isLeader = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        disciplineLeadUserId: ctx.userId,
      }),
      select: { id: true },
    });
    if (isLeader) {
      return {};
    }

    if (profile.isDepartmentLeader) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: projectId }),
        select: { departmentId: true },
      });
      if (
        project?.departmentId &&
        profile.ledDepartmentIds.includes(project.departmentId)
      ) {
        return {};
      }
    }

    return {
      OR: [
        ...subtaskRoleOr(ctx.userId),
        {
          taskDiscipline: activeOnly({
            companyId: ctx.companyId,
            OR: disciplineAssigneeOr(ctx.userId),
          }),
        },
        // Read-only: task responsible person sees all subtasks under their task.
        { taskDiscipline: { task: { supervisingChiefUserId: ctx.userId } } },
      ],
    };
  }

  /**
   * Asserts subtask visibility; throws 404 when out of scope.
   */
  async assertPackageReadable(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<void> {
    const scope = await this.buildPackageListWhere(
      ctx,
      projectId,
      taskDisciplineId,
    );
    const row = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: packageId,
        companyId: ctx.companyId,
        taskDisciplineId,
        ...scope,
      }),
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Design package not found');
    }
  }

  /**
   * Asserts subtask mutation rights (discipline leader or full access).
   */
  async assertPackageWritable(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    await this.assertDisciplineWritable(ctx, projectId, taskDisciplineId);
  }

  private async getDepartmentLeaderProjectIds(
    departmentIds: string[],
  ): Promise<string[]> {
    if (departmentIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.project.findMany({
      where: activeOnly({
        departmentId: { in: departmentIds },
      }),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async getDisciplineScopedProjectIds(ctx: PmContext): Promise<string[]> {
    const rows = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        OR: disciplineAssigneeOr(ctx.userId),
      }),
      select: { task: { select: { projectId: true } } },
    });
    return [...new Set(rows.map((row) => row.task.projectId))];
  }

  private async getSubtaskScopedProjectIds(ctx: PmContext): Promise<string[]> {
    const rows = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        OR: subtaskRoleOr(ctx.userId),
      }),
      select: {
        taskDiscipline: { select: { task: { select: { projectId: true } } } },
      },
    });
    return [
      ...new Set(rows.map((row) => row.taskDiscipline.task.projectId)),
    ];
  }
}
