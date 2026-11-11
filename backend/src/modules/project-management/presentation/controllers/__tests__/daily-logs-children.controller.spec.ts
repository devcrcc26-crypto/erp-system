import {
  INestApplication,
  ValidationPipe,
  type ExecutionContext,
  type CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DailyLogsController } from '../daily-logs.controller';
import { DailyLogsService } from '../../../application/services/daily-logs.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const dailyLogId = 'daily-log-1';

const workforceRecord = {
  id: 'workforce-1',
  dailyLogId,
  trade: 'Carpentry',
  contractor: 'Acme Build',
  workerCount: 12,
};

const incidentRecord = {
  id: 'incident-1',
  dailyLogId,
  incidentType: 'Near miss',
  description: 'Falling object on walkway',
  severity: 'LOW',
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('DailyLogsController child routes', () => {
  let app: INestApplication;
  let dailyLogsService: {
    addWorkforce: jest.Mock;
    removeWorkforce: jest.Mock;
    addIncident: jest.Mock;
  };
  let hasPermission: jest.Mock;

  beforeEach(async () => {
    dailyLogsService = {
      addWorkforce: jest.fn().mockResolvedValue(workforceRecord),
      removeWorkforce: jest.fn().mockResolvedValue(undefined),
      addIncident: jest.fn().mockResolvedValue(incidentRecord),
    };
    hasPermission = jest.fn().mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DailyLogsController],
      providers: [
        { provide: DailyLogsService, useValue: dailyLogsService },
        PermissionsGuard,
        { provide: PermissionService, useValue: { hasPermission } },
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

  it('POST workforce returns 201 and the created record', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/daily-logs/${dailyLogId}/workforce`)
      .send({
        trade: 'Carpentry',
        contractor: 'Acme Build',
        workerCount: 12,
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: workforceRecord,
    });
    expect(dailyLogsService.addWorkforce).toHaveBeenCalledWith(
      testUser,
      projectId,
      dailyLogId,
      {
        trade: 'Carpentry',
        contractor: 'Acme Build',
        workerCount: 12,
      },
    );
  });

  it('DELETE workforce returns 200', async () => {
    const response = await request(app.getHttpServer())
      .delete(
        `/projects/${projectId}/daily-logs/${dailyLogId}/workforce/workforce-1`,
      )
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { message: 'Workforce entry removed' },
    });
    expect(dailyLogsService.removeWorkforce).toHaveBeenCalledWith(
      testUser,
      projectId,
      dailyLogId,
      'workforce-1',
    );
  });

  it('POST incident returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/daily-logs/${dailyLogId}/incidents`)
      .send({
        incidentType: 'Near miss',
        description: 'Falling object on walkway',
        severity: 'LOW',
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: incidentRecord,
    });
    expect(dailyLogsService.addIncident).toHaveBeenCalledWith(
      testUser,
      projectId,
      dailyLogId,
      {
        incidentType: 'Near miss',
        description: 'Falling object on walkway',
        severity: 'LOW',
      },
    );
  });

  it('returns 403 when the user lacks daily_logs.create on POST', async () => {
    hasPermission.mockImplementation(
      async (
        _userId: string,
        _companyId: string,
        module: string,
        action: string,
      ) => !(module === 'daily_logs' && action === 'create'),
    );

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/daily-logs/${dailyLogId}/workforce`)
      .send({
        trade: 'Carpentry',
        workerCount: 4,
      })
      .expect(403);

    expect(dailyLogsService.addWorkforce).not.toHaveBeenCalled();
  });

  it('returns 403 when the user lacks daily_logs.edit on DELETE', async () => {
    hasPermission.mockImplementation(
      async (
        _userId: string,
        _companyId: string,
        module: string,
        action: string,
      ) => !(module === 'daily_logs' && action === 'edit'),
    );

    await request(app.getHttpServer())
      .delete(
        `/projects/${projectId}/daily-logs/${dailyLogId}/workforce/workforce-1`,
      )
      .expect(403);

    expect(dailyLogsService.removeWorkforce).not.toHaveBeenCalled();
  });
});
