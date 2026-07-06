import { Injectable } from '@nestjs/common';
import { DesignPackage } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatLocalizedName } from '../../../../shared/utils/bilingual-name.util';
import {
  SUBTASK_ROLE_LABELS,
  type SubtaskRoleField,
} from '../constants/my-work.constants';
import { subtaskRoleOr } from '../../domain/task-access-scope.util';
import { PmContext } from '../types/pm-context.type';
import { TaskAccessScopeService } from './task-access-scope.service';

export type MyWorkItemKind = 'DISCIPLINE_LEAD' | 'SUBTASK_ROLE';

export interface MyWorkItem {
  kind: MyWorkItemKind;
  projectId: string;
  projectName: string;
  projectNumber: string;
  taskId: string;
  taskName: string;
  taskDisciplineId: string;
  disciplineName: string;
  designPackageId: string | null;
  subtaskName: string | null;
  roleLabel: string | null;
  projectedStatus: string | null;
  packageStatus: string | null;
}

/**
 * Comment-8 phase 6 — assigned work surfacing for discipline leaders and subtask role holders.
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

    const [ledDisciplines, subtaskPackages] = await Promise.all([
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
          OR: subtaskRoleOr(ctx.userId),
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
    ]);

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
        taskDisciplineId: discipline.id,
        disciplineName: discipline.disciplineName,
        designPackageId: null,
        subtaskName: null,
        roleLabel: 'Discipline leader (专册)',
        projectedStatus: null,
        packageStatus: null,
      });
    }

    for (const pkg of subtaskPackages) {
      const discipline = pkg.taskDiscipline;
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
        taskDisciplineId: discipline.id,
        disciplineName: discipline.disciplineName,
        designPackageId: pkg.id,
        subtaskName: pkg.name,
        roleLabel: this.resolveSubtaskRoleLabel(pkg, ctx.userId),
        projectedStatus: pkg.projectedStatus,
        packageStatus: pkg.packageStatus,
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
