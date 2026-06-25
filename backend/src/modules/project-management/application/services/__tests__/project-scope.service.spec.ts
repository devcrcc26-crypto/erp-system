import { NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectScopeService } from '../project-scope.service';
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
    project: { findFirst: jest.Mock };
    projectTeam: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let service: ProjectScopeService;

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn() },
      projectTeam: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    service = new ProjectScopeService(prisma as unknown as PrismaService);
  });

  it('allows access when the user is an active project team member', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);
    prisma.projectTeam.findFirst.mockResolvedValue({ id: 'team-1' });

    await expect(service.getProjectOrThrow(ctx, projectId)).resolves.toBe(mockProject);

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, companyId: ctx.companyId, deletedAt: null },
    });
    expect(prisma.projectTeam.findFirst).toHaveBeenCalledWith({
      where: { projectId, userId: ctx.userId, deletedAt: null },
      select: { id: true },
    });
  });

  it('throws NotFoundException when the user is not a project team member', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);
    prisma.projectTeam.findFirst.mockResolvedValue(null);

    await expect(service.getProjectOrThrow(ctx, projectId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the project belongs to another company', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.getProjectOrThrow(ctx, projectId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the project team row is soft-deleted', async () => {
    prisma.project.findFirst.mockResolvedValue(mockProject);
    prisma.projectTeam.findFirst.mockResolvedValue(null);

    await expect(service.getProjectOrThrow(ctx, projectId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.projectTeam.findFirst).toHaveBeenCalledWith({
      where: { projectId, userId: ctx.userId, deletedAt: null },
      select: { id: true },
    });
  });

  it('returns distinct project ids for active team memberships', async () => {
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
