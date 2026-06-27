import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DisciplineScopeService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-doc-controller' };
  const projectId = 'project-1';

  let prisma: {
    taskDiscipline: { findMany: jest.Mock; findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let service: DisciplineScopeService;

  beforeEach(() => {
    prisma = {
      taskDiscipline: { findMany: jest.fn(), findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
    };
    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue(['Document Controller']),
    };
    service = new DisciplineScopeService(
      prisma as unknown as PrismaService,
      permissionService as unknown as PermissionService,
    );
  });

  it('scopes discipline reads to all assignee FK columns including institute chief and supporting designer', async () => {
    prisma.taskDiscipline.findMany.mockResolvedValue([]);

    await service.getAssignedDisciplineIds(ctx, projectId);

    expect(prisma.taskDiscipline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: ctx.companyId,
          OR: [
            { designerUserId: ctx.userId },
            { ownerUserId: ctx.userId },
            { reviewerUserId: ctx.userId },
            { disciplineLeadUserId: ctx.userId },
            { chiefUserId: ctx.userId },
            { instituteChiefUserId: ctx.userId },
            { supportingDesignerUserId: ctx.userId },
          ],
        }),
      }),
    );
  });

  it('allows access when user is assigned as supporting designer', async () => {
    prisma.taskDiscipline.findFirst.mockResolvedValue({ id: 'discipline-1' });

    await expect(
      service.assertDisciplineAccess(ctx, projectId, 'discipline-1'),
    ).resolves.toBeUndefined();

    expect(prisma.taskDiscipline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { supportingDesignerUserId: ctx.userId },
            { instituteChiefUserId: ctx.userId },
          ]),
        }),
      }),
    );
  });

  it('denies access when user is not on any assignee column', async () => {
    prisma.taskDiscipline.findFirst.mockResolvedValue(null);

    await expect(
      service.assertDisciplineAccess(ctx, projectId, 'discipline-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
