import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ChangeRequestsController } from '../change-requests.controller';
import { ProjectChangeRequestService } from '../../../application/services/project-change-request.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';
import { ProjectChangeRequestStatus } from '@prisma/client';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const changeRequestId = 'cr-1';

const changeRequest = {
  id: changeRequestId,
  companyId: testUser.companyId,
  projectId,
  changeNumber: 'CR-00001',
  title: 'Scope change',
  description: null,
  status: ProjectChangeRequestStatus.DRAFT,
  sourceType: 'MANUAL',
  sourceEntityId: null,
  externalReviewTriggerId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  approvedBy: null,
  approvedAt: null,
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('ChangeRequestsController', () => {
  let app: INestApplication;
  let service: {
    listChangeRequests: jest.Mock;
    createChangeRequest: jest.Mock;
    approveChangeRequest: jest.Mock;
    rejectChangeRequest: jest.Mock;
    deleteChangeRequest: jest.Mock;
  };
  let hasPermission: jest.Mock;

  beforeEach(async () => {
    service = {
      listChangeRequests: jest.fn().mockResolvedValue({
        data: [changeRequest],
        meta: { total: 1, page: 1, limit: 20, pages: 1 },
      }),
      createChangeRequest: jest.fn().mockResolvedValue(changeRequest),
      approveChangeRequest: jest.fn().mockResolvedValue({
        ...changeRequest,
        status: ProjectChangeRequestStatus.APPROVED,
      }),
      rejectChangeRequest: jest.fn().mockResolvedValue({
        ...changeRequest,
        status: ProjectChangeRequestStatus.REJECTED,
      }),
      deleteChangeRequest: jest.fn().mockResolvedValue(undefined),
    };
    hasPermission = jest.fn().mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ChangeRequestsController],
      providers: [
        { provide: ProjectChangeRequestService, useValue: service },
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

  it('lists change requests with pagination', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/change-requests`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(service.listChangeRequests).toHaveBeenCalled();
  });

  it('creates a change request', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/change-requests`)
      .send({ title: 'Scope change' })
      .expect(201);

    expect(service.createChangeRequest).toHaveBeenCalled();
  });

  it('approves a change request', async () => {
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/change-requests/${changeRequestId}/approve`)
      .expect(200);

    expect(service.approveChangeRequest).toHaveBeenCalled();
  });

  it('rejects a change request', async () => {
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/change-requests/${changeRequestId}/reject`)
      .send({ reason: 'Out of scope' })
      .expect(200);

    expect(service.rejectChangeRequest).toHaveBeenCalled();
  });

  it('soft-deletes a change request', async () => {
    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/change-requests/${changeRequestId}`)
      .expect(200);

    expect(service.deleteChangeRequest).toHaveBeenCalled();
  });

  it('returns 403 when user lacks permission', async () => {
    hasPermission.mockResolvedValue(false);

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/change-requests`)
      .expect(403);
  });
});
