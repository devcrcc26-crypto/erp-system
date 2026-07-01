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
import { ScheduleController } from '../schedule.controller';
import { ScheduleService } from '../../../application/services/schedule.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const taskId = 'task-1';
const milestoneId = 'milestone-1';

const taskResponse = {
  id: taskId,
  projectId,
  taskIdCode: 'TASK-00001',
  name: 'Foundation work',
  nameZh: '基础工程',
  status: 'NOT_STARTED',
};

const milestoneResponse = {
  id: milestoneId,
  projectId,
  name: 'Structural complete',
  status: 'PLANNED',
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('ScheduleController', () => {
  let app: INestApplication;
  let scheduleService: {
    getTaskById: jest.Mock;
    getMilestoneById: jest.Mock;
  };

  beforeEach(async () => {
    scheduleService = {
      getTaskById: jest.fn().mockResolvedValue(taskResponse),
      getMilestoneById: jest.fn().mockResolvedValue(milestoneResponse),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        { provide: ScheduleService, useValue: scheduleService },
        PermissionsGuard,
        {
          provide: PermissionService,
          useValue: { hasPermission: jest.fn().mockResolvedValue(true) },
        },
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new TestUserGuard());
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

  it('GET /tasks/:taskId returns the task', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/schedule/tasks/${taskId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(taskResponse);
    expect(scheduleService.getTaskById).toHaveBeenCalledWith(
      { companyId: testUser.companyId, userId: testUser.userId },
      projectId,
      taskId,
    );
  });

  it('GET /tasks/:taskId for a task from a different project returns 404', async () => {
    scheduleService.getTaskById.mockRejectedValue(
      new NotFoundException('Task not found'),
    );

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/schedule/tasks/${taskId}`)
      .expect(404);

    expect(scheduleService.getTaskById).toHaveBeenCalledWith(
      { companyId: testUser.companyId, userId: testUser.userId },
      projectId,
      taskId,
    );
  });

  it('GET /milestones/:milestoneId returns the milestone', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/schedule/milestones/${milestoneId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(milestoneResponse);
    expect(scheduleService.getMilestoneById).toHaveBeenCalledWith(
      { companyId: testUser.companyId, userId: testUser.userId },
      projectId,
      milestoneId,
    );
  });
});
