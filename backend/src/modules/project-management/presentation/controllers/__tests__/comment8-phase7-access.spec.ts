import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';
import { DesignPackagesController } from '../design-packages.controller';
import { DesignPackagesService } from '../../../application/services/design-packages.service';
import { PmModuleAccessGuard } from '../../guards/pm-module-access.guard';
import { ProjectExportService } from '../../../application/services/project-export.service';
import { ProjectScopeService } from '../../../application/services/project-scope.service';
import { ScheduleController } from '../schedule.controller';
import { ScheduleService } from '../../../application/services/schedule.service';
import { UsersController } from '../../../../user-management/presentation/controllers/users.controller';
import { UserManagementService } from '../../../../user-management/application/services/user-management.service';
import { TaskAccessScopeService } from '../../../application/services/task-access-scope.service';
import { PmContext } from '../../../application/types/pm-context.type';

const companyId = 'company-1';
const projectId = 'project-mtd';
const projectAddId = 'project-add';
const taskDisciplineId = 'discipline-lead-b';
const packageId = 'package-lead-b';

class TestUserGuard implements CanActivate {
  constructor(private readonly userId: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: unknown }>();
    req.user = { userId: this.userId, companyId };
    return true;
  }
}

describe('Comment 8 Phase 7 - API access scoping (supertest)', () => {
  describe('DesignPackagesController', () => {
    let app: INestApplication;
    let designPackagesService: { getById: jest.Mock; list: jest.Mock };

    beforeEach(async () => {
      designPackagesService = {
        getById: jest.fn(),
        list: jest.fn(),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [DesignPackagesController],
        providers: [
          { provide: DesignPackagesService, useValue: designPackagesService },
          { provide: ProjectScopeService, useValue: { getProjectOrThrow: jest.fn() } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(true) },
          },
          Reflector,
        ],
      })
        .overrideGuard(PmModuleAccessGuard)
        .useValue({ canActivate: () => true })
        .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalGuards(new TestUserGuard('leader-a'));
      app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('(i) discipline leader A fetching leader B subtask id returns 404', async () => {
      designPackagesService.getById.mockRejectedValue(
        new NotFoundException('Design package not found'),
      );

      await request(app.getHttpServer())
        .get(
          `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages/${packageId}`,
        )
        .expect(404);

      expect(designPackagesService.getById).toHaveBeenCalledWith(
        { companyId, userId: 'leader-a' },
        projectId,
        taskDisciplineId,
        packageId,
      );
    });

    it('(ii) designer subtask list endpoint delegates scoped list to service', async () => {
      designPackagesService.list.mockResolvedValue([
        { id: 'pkg-mine', name: 'My layout' },
      ]);

      const response = await request(app.getHttpServer())
        .get(
          `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages`,
        )
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(designPackagesService.list).toHaveBeenCalledWith(
        { companyId, userId: 'leader-a' },
        projectId,
        taskDisciplineId,
      );
    });

    it('(iii) discipline leader can create subtask without RBAC schedule.create', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [DesignPackagesController],
        providers: [
          {
            provide: DesignPackagesService,
            useValue: {
              ...designPackagesService,
              create: jest.fn().mockResolvedValue({
                id: 'pkg-new',
                name: 'New subtask',
                subtaskId: 'OS-TEST-01-01',
              }),
            },
          },
          { provide: ProjectScopeService, useValue: { getProjectOrThrow: jest.fn() } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(false) },
          },
          Reflector,
        ],
      })
        .overrideGuard(PmModuleAccessGuard)
        .useValue({ canActivate: () => true })
        .compile();

      const createApp = moduleRef.createNestApplication();
      createApp.useGlobalGuards(new TestUserGuard('leader-a'));
      createApp.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      createApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await createApp.init();

      const response = await request(createApp.getHttpServer())
        .post(
          `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages`,
        )
        .send({ name: 'New subtask' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subtaskId).toBe('OS-TEST-01-01');

      await createApp.close();
    });

    it('(iv) unassigned user create is blocked by service assertDisciplineWritable', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [DesignPackagesController],
        providers: [
          {
            provide: DesignPackagesService,
            useValue: {
              ...designPackagesService,
              create: jest
                .fn()
                .mockRejectedValue(
                  new NotFoundException('Task discipline not found'),
                ),
            },
          },
          { provide: ProjectScopeService, useValue: { getProjectOrThrow: jest.fn() } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(false) },
          },
          Reflector,
        ],
      })
        .overrideGuard(PmModuleAccessGuard)
        .useValue({ canActivate: () => true })
        .compile();

      const createApp = moduleRef.createNestApplication();
      createApp.useGlobalGuards(new TestUserGuard('random-user'));
      createApp.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      createApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await createApp.init();

      await request(createApp.getHttpServer())
        .post(
          `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages`,
        )
        .send({ name: 'Should fail' })
        .expect(404);

      await createApp.close();
    });
  });

  describe('ScheduleController task list', () => {
    let app: INestApplication;
    let scheduleService: { listTasks: jest.Mock };

    beforeEach(async () => {
      scheduleService = {
        listTasks: jest.fn().mockResolvedValue({
          data: [{ id: 'task-scoped', name: 'Scoped task' }],
          meta: { total: 1, page: 1, limit: 20, pages: 1 },
        }),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ScheduleController],
        providers: [
          { provide: ScheduleService, useValue: scheduleService },
          { provide: ProjectExportService, useValue: { exportTaskList: jest.fn() } },
          { provide: ProjectScopeService, useValue: { getProjectOrThrow: jest.fn() } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(true) },
          },
          Reflector,
        ],
      })
        .overrideGuard(PmModuleAccessGuard)
        .useValue({ canActivate: () => true })
        .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalGuards(new TestUserGuard('designer-1'));
      app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('(v) schedule task list uses scoped service for designer token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/schedule/tasks?page=1&limit=20`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(scheduleService.listTasks).toHaveBeenCalledTimes(1);
      const [ctxArg, calledProjectId, query] =
        scheduleService.listTasks.mock.calls[0] ?? [];
      expect(ctxArg).toEqual({ companyId, userId: 'designer-1' });
      expect(calledProjectId).toBe(projectId);
      expect(Number(query.page)).toBe(1);
      expect(Number(query.limit)).toBe(20);
    });
  });

  describe('UsersController - Project Administrator', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [
          {
            provide: UserManagementService,
            useValue: { listUsers: jest.fn(), getUser: jest.fn() },
          },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(false) },
          },
          Reflector,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalGuards(new TestUserGuard('project-admin-1'));
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('(iv) Project Admin token is rejected from user-management list', async () => {
      await request(app.getHttpServer()).get('/users').expect(403);
    });
  });
});

describe('Comment 8 Phase 7 - TaskAccessScopeService scoping rules', () => {
  const mtdDeptId = 'e0000000-0000-4000-8000-000000000001';
  const addDeptId = 'e0000000-0000-4000-8000-000000000002';

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
      getUserRoleNames: jest.fn().mockResolvedValue(['Employee']),
    };
    service = new TaskAccessScopeService(
      prisma as unknown as PrismaService,
      permissionService as unknown as PermissionService,
    );
  });

  it('(iii) Municipal Transportation department leader sees zero Architectural Design projects', async () => {
    const ctx: PmContext = { companyId, userId: 'mtd-leader' };
    prisma.department.findMany.mockResolvedValue([{ id: mtdDeptId }]);
    prisma.project.findMany.mockResolvedValue([{ id: projectId }]);
    prisma.taskDiscipline.findMany.mockResolvedValue([]);
    prisma.designPackage.findMany.mockResolvedValue([]);

    const visibleIds = await service.getVisibleProjectIds(ctx);

    expect(visibleIds).toEqual([projectId]);
    expect(visibleIds).not.toContain(projectAddId);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: { in: [mtdDeptId] },
        }),
      }),
    );
  });

  it('(ii) subtask role holder package filter only matches their user id', async () => {
    const ctx: PmContext = { companyId, userId: 'designer-42' };
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      companyId,
    });
    prisma.designPackage.findMany.mockResolvedValue([
      { taskDiscipline: { task: { projectId } } },
    ]);
    prisma.projectTeam.findFirst.mockResolvedValue(null);
    prisma.taskDiscipline.findFirst.mockImplementation(
      (args: { where?: { disciplineLeadUserId?: string } }) => {
        if (args.where?.disciplineLeadUserId) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: 'disc-1' });
      },
    );

    const where = await service.buildPackageListWhere(
      ctx,
      projectId,
      'disc-1',
    );

    expect(where).toEqual({
      OR: [
        { designerUserId: 'designer-42' },
        { reviewerUserId: 'designer-42' },
        { disciplinaryLeaderUserId: 'designer-42' },
        { deptDeputyChiefUserId: 'designer-42' },
        { instituteChiefUserId: 'designer-42' },
        { disciplineOwnerUserId: 'designer-42' },
        { supportingDesignerUserId: 'designer-42' },
      ],
    });
  });

  it('(i) discipline leader A cannot write discipline led by B', async () => {
    const ctx: PmContext = { companyId, userId: 'leader-a' };
    prisma.taskDiscipline.findFirst.mockResolvedValue(null);

    await expect(
      service.assertDisciplineWritable(ctx, projectId, taskDisciplineId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
