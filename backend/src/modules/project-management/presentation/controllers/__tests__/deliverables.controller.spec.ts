import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DeliverablesController } from '../deliverables.controller';
import { DeliverableService } from '../../../application/services/deliverable.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('DeliverablesController', () => {
  let app: INestApplication;
  let service: { listDeliverables: jest.Mock; createDeliverable: jest.Mock };

  beforeEach(async () => {
    service = {
      listDeliverables: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, pages: 0 },
      }),
      createDeliverable: jest.fn().mockResolvedValue({
        id: 'deliverable-1',
        name: 'Foundation drawings',
        status: 'PLANNED',
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DeliverablesController],
      providers: [
        { provide: DeliverableService, useValue: service },
        PermissionsGuard,
        { provide: PermissionService, useValue: { hasPermission: jest.fn().mockResolvedValue(true) } },
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

  it('lists deliverables with empty pagination', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/deliverables`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
    expect(service.listDeliverables).toHaveBeenCalled();
  });

  it('creates a deliverable', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/deliverables`)
      .send({ name: 'Foundation drawings' })
      .expect(201);

    expect(service.createDeliverable).toHaveBeenCalled();
  });
});
