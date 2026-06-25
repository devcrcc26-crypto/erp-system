import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DesignPackagesController } from '../design-packages.controller';
import { DesignPackagesService } from '../../../application/services/design-packages.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const taskDisciplineId = 'discipline-1';
const packageId = 'package-1';
const reviewSessionId = 'session-1';

const snapshot = {
  snapshotId: 'snapshot-1',
  capturedAt: new Date().toISOString(),
  contentHash: 'abc123',
  engineeringDocumentVersions: [
    {
      id: 'edv-1',
      revisionLabel: 'Rev A',
      statusAtCapture: 'LOCKED',
      engineeringDocumentName: 'Drawing 001',
    },
  ],
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('DesignPackagesController review context snapshot', () => {
  let app: INestApplication;
  let designPackagesService: { getReviewContextSnapshot: jest.Mock };

  beforeEach(async () => {
    designPackagesService = {
      getReviewContextSnapshot: jest.fn().mockResolvedValue(snapshot),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DesignPackagesController],
      providers: [
        { provide: DesignPackagesService, useValue: designPackagesService },
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

  it('returns review context snapshot for a session', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages/${packageId}/review-sessions/${reviewSessionId}/snapshot`,
      )
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.contentHash).toBe('abc123');
    expect(response.body.data.engineeringDocumentVersions).toHaveLength(1);
    expect(designPackagesService.getReviewContextSnapshot).toHaveBeenCalledWith(
      { companyId: testUser.companyId, userId: testUser.userId },
      projectId,
      taskDisciplineId,
      packageId,
      reviewSessionId,
    );
  });
});
