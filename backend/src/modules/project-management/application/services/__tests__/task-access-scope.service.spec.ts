import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { TaskAccessScopeService } from '../task-access-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('TaskAccessScopeService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-designer' };
  const projectId = 'project-1';
  const taskId = 'task-1';
  const disciplineId = 'discipline-1';
  const packageId = 'package-1';

  let prisma: {
    department: { findMany: jest.Mock };
    project: { findFirst: jest.Mock; findMany: jest.Mock };
    projectTeam: { findFirst: jest.Mock; findMany: jest.Mock };
    task: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    taskDiscipline: { findMany: jest.Mock; findFirst: jest.Mock };
    designPackage: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let service: TaskAccessScopeService;

  beforeEach(() => {
    prisma = {
      department: { findMany: jest.fn().mockResolvedValue([]) },
      project: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectTeam: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      taskDiscipline: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      designPackage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue(['Designer']),
    };
    service = new TaskAccessScopeService(
      prisma as unknown as PrismaService,
      permissionService as unknown as PermissionService,
    );
  });

  it('returns null project id filter for system administrator', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['System Administrator']);

    await expect(service.getVisibleProjectIds(ctx)).resolves.toBeNull();
  });

  it('returns null project id filter for project administrator', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['Project Administrator']);

    await expect(service.getVisibleProjectIds(ctx)).resolves.toBeNull();
  });

  it('allows project administrator to read any project detail when visibleIds is null', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['Project Administrator']);
    const project = {
      id: projectId,
      companyId: ctx.companyId,
    };
    prisma.project.findFirst.mockResolvedValue(project);

    await expect(service.assertProjectReadable(ctx, projectId)).resolves.toEqual(
      project,
    );
  });

  it('scopes department leader reads to led departments only', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['Employee']);
    prisma.department.findMany.mockResolvedValue([{ id: 'dept-mtd' }]);
    prisma.project.findMany.mockResolvedValue([{ id: 'project-mtd' }]);

    const ids = await service.getVisibleProjectIds(ctx);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: { in: ['dept-mtd'] },
        }),
      }),
    );
    expect(ids).toEqual(['project-mtd']);
  });

  it('returns 404 for out-of-scope project detail', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      companyId: ctx.companyId,
    });

    await expect(service.assertProjectReadable(ctx, projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows subtask role holder to read assigned package only', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      companyId: ctx.companyId,
      departmentId: 'dept-1',
    });
    prisma.designPackage.findMany.mockResolvedValue([
      {
        taskDiscipline: { task: { projectId } },
      },
    ]);
    prisma.taskDiscipline.findFirst.mockResolvedValue({ id: disciplineId });
    prisma.designPackage.findFirst.mockResolvedValue({ id: packageId });

    await expect(
      service.assertPackageReadable(ctx, projectId, disciplineId, packageId),
    ).resolves.toBeUndefined();
  });

  it('returns 404 when discipline leader fetches another leaders package write scope', async () => {
    prisma.taskDiscipline.findFirst.mockResolvedValue(null);

    await expect(
      service.assertDisciplineWritable(ctx, projectId, disciplineId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters task list to disciplines and subtasks for scoped users', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      companyId: ctx.companyId,
    });
    prisma.taskDiscipline.findMany.mockResolvedValue([
      { task: { projectId } },
    ]);
    prisma.designPackage.findMany.mockResolvedValue([]);

    const where = await service.buildTaskListWhere(ctx, projectId);

    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ projectId }),
          expect.objectContaining({
            OR: expect.any(Array),
          }),
        ]),
      }),
    );
  });
});
