import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ProjectsController } from '../projects.controller';
import { ProjectExportService } from '../../../application/services/project-export.service';
import { ProjectsService } from '../../../application/services/projects.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };

const projectResponse = {
  id: 'project-1',
  projectCode: 'PRJ-00001',
  name: 'Marina Tower',
  nameZh: '滨海大厦',
  status: 'IN_PROGRESS',
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('ProjectsController', () => {
  let app: INestApplication;
  let projectsService: { createProject: jest.Mock };
  let hasPermission: jest.Mock;

  beforeEach(async () => {
    projectsService = {
      createProject: jest.fn().mockResolvedValue(projectResponse),
    };
    hasPermission = jest.fn().mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        {
          provide: ProjectExportService,
          useValue: { exportProjectList: jest.fn(), exportProjectListForProject: jest.fn() },
        },
        PermissionsGuard,
        {
          provide: PermissionService,
          useValue: { hasPermission },
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

  it('POST /projects returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .send({
        projectCode: 'PRJ-00001',
        name: 'Marina Tower',
        nameZh: '滨海大厦',
        projectType: 'COMMERCIAL',
        status: 'NOT_STARTED',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(projectResponse);
    expect(projectsService.createProject).toHaveBeenCalled();
  });

  it('returns 403 when user lacks permission', async () => {
    hasPermission.mockResolvedValue(false);

    await request(app.getHttpServer())
      .post('/projects')
      .send({
        projectCode: 'PRJ-00002',
        name: 'Blocked Project',
        nameZh: '受阻项目',
        projectType: 'COMMERCIAL',
        status: 'NOT_STARTED',
      })
      .expect(403);

    expect(projectsService.createProject).not.toHaveBeenCalled();
  });
});
