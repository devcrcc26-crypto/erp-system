import { NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectScopeService } from '../project-scope.service';
import { TaskAccessScopeService } from '../task-access-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('ProjectScopeService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  const mockProject = {
    id: projectId,
    companyId: ctx.companyId,
    deletedAt: null,
  } as Project;

  let prisma: {
    projectTeam: { findMany: jest.Mock };
  };
  let taskAccessScopeService: {
    assertProjectReadable: jest.Mock;
  };
  let service: ProjectScopeService;

  beforeEach(() => {
    prisma = {
      projectTeam: { findMany: jest.fn() },
    };
    taskAccessScopeService = {
      assertProjectReadable: jest.fn().mockResolvedValue(mockProject),
    };
    service = new ProjectScopeService(
      prisma as unknown as PrismaService,
      taskAccessScopeService as unknown as TaskAccessScopeService,
    );
  });

  it('delegates project reads to TaskAccessScopeService (subtask/discipline scope)', async () => {
    await expect(service.getProjectOrThrow(ctx, projectId)).resolves.toBe(
      mockProject,
    );

    expect(taskAccessScopeService.assertProjectReadable).toHaveBeenCalledWith(
      ctx,
      projectId,
    );
  });

  it('assertModuleAccess uses project readability, not ProjectTeam', async () => {
    await expect(
      service.assertModuleAccess(ctx, projectId, 'design_packages'),
    ).resolves.toBeUndefined();

    expect(taskAccessScopeService.assertProjectReadable).toHaveBeenCalledWith(
      ctx,
      projectId,
    );
  });

  it('propagates NotFoundException when project is not readable', async () => {
    taskAccessScopeService.assertProjectReadable.mockRejectedValue(
      new NotFoundException('Project not found'),
    );

    await expect(service.getProjectOrThrow(ctx, projectId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns distinct project ids for active team memberships (roster only)', async () => {
    prisma.projectTeam.findMany.mockResolvedValue([
      { projectId: 'project-1' },
      { projectId: 'project-2' },
      { projectId: 'project-1' },
    ]);

    await expect(service.getTeamProjectIds(ctx)).resolves.toEqual([
      'project-1',
      'project-2',
    ]);

    expect(prisma.projectTeam.findMany).toHaveBeenCalledWith({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        project: { companyId: ctx.companyId, deletedAt: null },
      },
      select: { projectId: true },
    });
  });
});
