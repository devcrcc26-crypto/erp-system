import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { TaskAccessScopeService } from '../task-access-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DisciplineScopeService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-doc-controller' };
  const projectId = 'project-1';

  let prisma: {
    taskDiscipline: { findMany: jest.Mock; findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
  };
  let taskAccessScopeService: {
    resolveProfile: jest.Mock;
    assertDisciplineReadable: jest.Mock;
    buildDisciplineListWhere: jest.Mock;
  };
  let service: DisciplineScopeService;

  beforeEach(() => {
    prisma = {
      taskDiscipline: { findMany: jest.fn(), findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
    };
    taskAccessScopeService = {
      resolveProfile: jest.fn().mockResolvedValue({
        hasFullProjectAccess: false,
        isProjectAdmin: false,
        canManageSubtasks: false,
        ledDepartmentIds: [],
        isDepartmentLeader: false,
      }),
      assertDisciplineReadable: jest.fn().mockResolvedValue(undefined),
      buildDisciplineListWhere: jest.fn().mockResolvedValue({
        OR: [{ designerUserId: ctx.userId }],
      }),
    };
    service = new DisciplineScopeService(
      prisma as unknown as PrismaService,
      taskAccessScopeService as unknown as TaskAccessScopeService,
    );
  });

  it('scopes discipline reads to all assignee FK columns including institute chief and supporting designer', async () => {
    prisma.taskDiscipline.findMany.mockResolvedValue([]);

    await service.getAssignedDisciplineIds(ctx, projectId);

    expect(prisma.taskDiscipline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: ctx.companyId,
          OR: expect.arrayContaining([
            { disciplineLeadUserId: ctx.userId },
            { designerUserId: ctx.userId },
            { supportingDesignerUserId: ctx.userId },
            { instituteChiefUserId: ctx.userId },
          ]),
        }),
      }),
    );
  });

  it('delegates discipline access checks to task access scope', async () => {
    await expect(
      service.assertDisciplineAccess(ctx, projectId, 'discipline-1'),
    ).resolves.toBeUndefined();

    expect(taskAccessScopeService.assertDisciplineReadable).toHaveBeenCalledWith(
      ctx,
      projectId,
      'discipline-1',
    );
  });

  it('returns 404 when task access scope denies discipline', async () => {
    taskAccessScopeService.assertDisciplineReadable.mockRejectedValue(
      new NotFoundException('Task discipline not found'),
    );

    await expect(
      service.assertDisciplineAccess(ctx, projectId, 'discipline-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
