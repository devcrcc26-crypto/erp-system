import { Injectable } from '@nestjs/common';
import { DesignPackage, ReviewTier } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatLocalizedName } from '../../../../shared/utils/bilingual-name.util';
import {
  SUBTASK_ROLE_LABELS,
  type SubtaskRoleField,
} from '../constants/my-work.constants';
import { disciplineAssigneeOr, subtaskRoleOr } from '../../domain/task-access-scope.util';
import { getEffectiveApprovalChain } from '../../domain/approval-chain.util';
import {
  resolveSubtaskRoles,
  type SubtaskRole,
} from '../../domain/subtask-role-resolver.util';
import { PmContext } from '../types/pm-context.type';
import { TaskAccessScopeService } from './task-access-scope.service';

export type MyWorkItemKind =
  | 'DISCIPLINE_LEAD'
  | 'SUBTASK_ROLE'
  | 'RESPONSIBLE_PERSON';

export interface MyWorkItem {
  kind: MyWorkItemKind;
  projectId: string;
  projectName: string;
  projectNumber: string;
  taskId: string;
  taskName: string;
  taskIdCode: string;
  overseasTaskNumber: string | null;
  taskDisciplineId: string;
  disciplineName: string;
  disciplineIndex: number | null;
  designPackageId: string | null;
  subtaskName: string | null;
  subtaskId: string | null;
  /** Package subtask index (padded in full code as 3 digits). */
  subtaskIndex: number | null;
  packageCode: string | null;
  roleLabel: string | null;
  /** DESIGNER/SUPPORTING_DESIGNER take priority; otherwise highest reviewer-tier role, else DISCIPLINE_OWNER. Null for DISCIPLINE_LEAD-kind items. */
  primaryRole: SubtaskRole | null;
  /** Highest reviewer-tier role also held, only set when primaryRole is DESIGNER or SUPPORTING_DESIGNER. */
  secondaryReviewRole: ReviewTier | null;
  projectedStatus: string | null;
  packageStatus: string | null;
  subtaskCount?: number;
}

/**
 * Comment-8 phase 6 - assigned work surfacing for discipline leaders and subtask role holders.
 */
@Injectable()
export class MyWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
  ) {}

  /**
   * Returns tasks the user leads and subtasks where they hold any role.
   */
  async getMyWork(
    ctx: PmContext,
    projectId?: string,
  ): Promise<MyWorkItem[]> {
    const visibleProjectIds = await this.taskAccessScopeService.getVisibleProjectIds(
      ctx,
    );
    const taskRelationFilter =
      projectId !== undefined
        ? { projectId, deletedAt: null }
        : visibleProjectIds === null
          ? { deletedAt: null }
          : {
              deletedAt: null,
              projectId: {
                in: visibleProjectIds.length > 0 ? visibleProjectIds : ['__none__'],
              },
            };

    const [ledDisciplines, subtaskPackages, responsibleTasks] = await Promise.all([
      this.prisma.taskDiscipline.findMany({
        where: activeOnly({
          companyId: ctx.companyId,
          disciplineLeadUserId: ctx.userId,
          task: taskRelationFilter,
        }),
        include: {
          task: {
            include: {
              project: {
                select: { id: true, name: true, nameZh: true, projectCode: true },
              },
            },
          },
        },
        orderBy: [{ task: { project: { name: 'asc' } } }, { disciplineName: 'asc' }],
      }),
      this.prisma.designPackage.findMany({
        where: activeOnly({
          companyId: ctx.companyId,
          OR: [
            ...subtaskRoleOr(ctx.userId),
            {
              taskDiscipline: activeOnly({
                companyId: ctx.companyId,
                OR: disciplineAssigneeOr(ctx.userId),
              }),
            },
          ],
          taskDiscipline: {
            task: taskRelationFilter,
          },
        }),
        include: {
          taskDiscipline: {
            include: {
              task: {
                include: {
                  project: {
                    select: {
                      id: true,
                      name: true,
                      nameZh: true,
                      projectCode: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.task.findMany({
        where: {
          ...taskRelationFilter,
          supervisingChiefUserId: ctx.userId,
          project: { companyId: ctx.companyId, deletedAt: null },
        },
        include: {
          project: {
            select: { id: true, name: true, nameZh: true, projectCode: true },
          },
        },
        orderBy: [{ project: { name: 'asc' } }, { name: 'asc' }],
      }),
    ]);

    const subtaskCounts = await this.prisma.designPackage.groupBy({
      by: ['taskDisciplineId'],
      where: activeOnly({
        companyId: ctx.companyId,
        taskDisciplineId: { in: ledDisciplines.map((d) => d.id) },
      }),
      _count: { id: true },
    });

    const countByDisciplineId = new Map(
      subtaskCounts.map((r) => [r.taskDisciplineId, r._count.id]),
    );

    const items: MyWorkItem[] = [];

    for (const discipline of ledDisciplines) {
      items.push({
        kind: 'DISCIPLINE_LEAD',
        projectId: discipline.task.projectId,
        projectName: discipline.task.project.name,
        projectNumber: discipline.task.project.projectCode,
        taskId: discipline.taskId,
        taskName: formatLocalizedName(
          discipline.task.name,
          discipline.task.nameZh,
        ),
        taskIdCode: discipline.task.taskIdCode,
        overseasTaskNumber: discipline.task.overseasTaskNumber,
        taskDisciplineId: discipline.id,
        disciplineName: discipline.disciplineName,
        disciplineIndex: discipline.disciplineIndex,
        designPackageId: null,
        subtaskName: null,
        subtaskId: null,
        subtaskIndex: null,
        packageCode: null,
        roleLabel: 'Discipline leader (专册)',
        primaryRole: null,
        secondaryReviewRole: null,
        projectedStatus: null,
        packageStatus: null,
        subtaskCount: countByDisciplineId.get(discipline.id) ?? 0,
      });
    }

    for (const pkg of subtaskPackages) {
      const discipline = pkg.taskDiscipline;
      const effectiveChain = getEffectiveApprovalChain(pkg, discipline);
      const { primaryRole, secondaryReviewRole } = resolveSubtaskRoles(
        effectiveChain,
        ctx.userId,
      );
      items.push({
        kind: 'SUBTASK_ROLE',
        projectId: discipline.task.projectId,
        projectName: discipline.task.project.name,
        projectNumber: discipline.task.project.projectCode,
        taskId: discipline.taskId,
        taskName: formatLocalizedName(
          discipline.task.name,
          discipline.task.nameZh,
        ),
        taskIdCode: discipline.task.taskIdCode,
        overseasTaskNumber: discipline.task.overseasTaskNumber,
        taskDisciplineId: discipline.id,
        disciplineName: discipline.disciplineName,
        disciplineIndex: discipline.disciplineIndex,
        designPackageId: pkg.id,
        subtaskName: pkg.name,
        subtaskId: pkg.subtaskId,
        subtaskIndex: pkg.subtaskIndex,
        packageCode: pkg.packageCode,
        roleLabel: this.resolveSubtaskRoleLabel(pkg, ctx.userId),
        primaryRole,
        secondaryReviewRole,
        projectedStatus: pkg.projectedStatus,
        packageStatus: pkg.packageStatus,
      });
    }

    for (const task of responsibleTasks) {
      items.push({
        kind: 'RESPONSIBLE_PERSON',
        projectId: task.projectId,
        projectName: task.project.name,
        projectNumber: task.project.projectCode,
        taskId: task.id,
        taskName: formatLocalizedName(task.name, task.nameZh),
        taskIdCode: task.taskIdCode,
        overseasTaskNumber: task.overseasTaskNumber,
        taskDisciplineId: '',
        disciplineName: '',
        disciplineIndex: null,
        designPackageId: null,
        subtaskName: null,
        subtaskId: null,
        subtaskIndex: null,
        packageCode: null,
        roleLabel: 'Responsible person',
        primaryRole: null,
        secondaryReviewRole: null,
        projectedStatus: null,
        packageStatus: null,
      });
    }

    return items.sort((a, b) => {
      const projectCompare = a.projectName.localeCompare(b.projectName);
      if (projectCompare !== 0) {
        return projectCompare;
      }
      const taskCompare = a.taskName.localeCompare(b.taskName);
      if (taskCompare !== 0) {
        return taskCompare;
      }
      if (a.kind === 'DISCIPLINE_LEAD' && b.kind !== 'DISCIPLINE_LEAD') {
        return -1;
      }
      if (b.kind === 'DISCIPLINE_LEAD' && a.kind !== 'DISCIPLINE_LEAD') {
        return 1;
      }
      return (a.subtaskName ?? '').localeCompare(b.subtaskName ?? '');
    });
  }

  private resolveSubtaskRoleLabel(
    pkg: DesignPackage,
    userId: string,
  ): string {
    const fields = Object.keys(SUBTASK_ROLE_LABELS) as SubtaskRoleField[];
    const matched = fields.filter((field) => pkg[field] === userId);
    if (matched.length === 0) {
      return 'Subtask role';
    }
    return matched.map((field) => SUBTASK_ROLE_LABELS[field]).join(', ');
  }
}
