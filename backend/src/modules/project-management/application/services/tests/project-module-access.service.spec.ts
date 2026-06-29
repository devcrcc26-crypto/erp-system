import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { canAccessModule } from '../../../domain/project-modules.const';
import { PmContext } from '../../types/pm-context.type';
import { ProjectsService } from '../projects.service';
import { ProjectScopeService } from '../project-scope.service';

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

    projectScopeService = new ProjectScopeService(
      prisma as unknown as PrismaService,
      { getUserRoleNames: jest.fn().mockResolvedValue(['Employee']) } as never,
    );

    projectsService = new ProjectsService(
      prisma as unknown as PrismaService,
      projectScopeService,
      { hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true) } as never,
      { ensureProjectFolder: jest.fn() } as never,
    );
  });

  it('1. visibleModules=[] can access any module (full access default)', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({ visibleModules: [] });

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'submittals'),
    ).resolves.toBeUndefined();

    expect(canAccessModule([], 'schedule')).toBe(true);
  });

  it('2. visibleModules=[rfis,issues] can access rfis → allowed', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({
      visibleModules: ['rfis', 'issues'],
    });

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'rfis'),
    ).resolves.toBeUndefined();
  });

  it('3. visibleModules=[rfis,issues] tries submittals → ForbiddenException', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({
      visibleModules: ['rfis', 'issues'],
    });

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'submittals'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('4. user not on project team → NotFoundException', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue(null);

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'rfis'),
    ).rejects.toThrow(NotFoundException);
  });

  it('5. PM adding team member with visibleModules=[rfis] → stored correctly', async () => {
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

  it('6. PM adding team member with no visibleModules → stored as []', async () => {
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

  it('7. visibleModules=[] accesses schedule → allowed', async () => {
    prisma.projectTeam.findFirst.mockResolvedValue({ visibleModules: [] });

    await expect(
      projectScopeService.assertModuleAccess(ctx, projectId, 'schedule'),
    ).resolves.toBeUndefined();
  });
});
