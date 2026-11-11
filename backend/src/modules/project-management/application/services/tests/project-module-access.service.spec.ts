import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectsService } from '../projects.service';
import { ProjectScopeService } from '../project-scope.service';
import { TaskAccessScopeService } from '../task-access-scope.service';

describe('Project module access (project-module-access)', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  let prisma: {
    projectTeam: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    project: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let taskAccessScopeService: {
    assertProjectReadable: jest.Mock;
    getVisibleProjectIds: jest.Mock;
  };
  let projectScopeService: ProjectScopeService;
  let projectsService: ProjectsService;

  beforeEach(() => {
    prisma = {
      projectTeam: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: projectId,
          companyId: ctx.companyId,
        }),
      },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    taskAccessScopeService = {
      assertProjectReadable: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
      getVisibleProjectIds: jest.fn(),
    };

    projectScopeService = new ProjectScopeService(
      prisma as unknown as PrismaService,
      taskAccessScopeService as unknown as TaskAccessScopeService,
    );

    projectsService = new ProjectsService(
      prisma as unknown as PrismaService,
      projectScopeService,
      { hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true) } as never,
      taskAccessScopeService as unknown as TaskAccessScopeService,
      { ensureEngineeringDocumentFolder: jest.fn() } as never,
    );
  });

  it('1. allows module access when project is readable via subtask/discipline scope', async () => {
    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'design_packages'),
    ).resolves.toBeUndefined();

    expect(taskAccessScopeService.assertProjectReadable).toHaveBeenCalledWith(
      ctx,
      projectId,
    );
    expect(prisma.projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('2. does not consult ProjectTeam.visibleModules for access', async () => {
    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'submittals'),
    ).resolves.toBeUndefined();

    expect(prisma.projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('3. denies when project is not readable (no subtask/discipline/leadership scope)', async () => {
    taskAccessScopeService.assertProjectReadable.mockRejectedValue(
      new NotFoundException('Project not found'),
    );

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'design_packages'),
    ).rejects.toThrow(NotFoundException);
  });

  it('4. PM adding team member with visibleModules=[rfis] → stored correctly', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({ id: 'self-team' });
    prisma.$transaction.mockImplementation(async (work) => work(prisma));
    prisma.projectTeam.findMany.mockResolvedValue([]);
    prisma.projectTeam.create.mockResolvedValue({
      id: 'team-1',
      projectId,
      userId: 'user-2',
      visibleModules: ['rfis'],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      deletedBy: null,
      roleOnProject: null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });

    await projectsService.setTeam(ctx, projectId, {
      members: [{ userId: 'user-2', visibleModules: ['rfis'] }],
    });

    expect(prisma.projectTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibleModules: ['rfis'],
        }),
      }),
    );
  });

  it('5. PM adding team member with no visibleModules → stored as []', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({ id: 'self-team' });
    prisma.$transaction.mockImplementation(async (work) => work(prisma));
    prisma.projectTeam.findMany.mockResolvedValue([]);
    prisma.projectTeam.create.mockResolvedValue({
      id: 'team-2',
      projectId,
      userId: 'user-3',
      visibleModules: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      deletedBy: null,
      roleOnProject: null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-3' });

    await projectsService.setTeam(ctx, projectId, {
      members: [{ userId: 'user-3' }],
    });

    expect(prisma.projectTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibleModules: [],
        }),
      }),
    );
  });
});
