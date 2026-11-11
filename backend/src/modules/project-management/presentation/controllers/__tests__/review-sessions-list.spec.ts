import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewSessionStatus } from '@prisma/client';
import request from 'supertest';
import { DesignPackagesController } from '../design-packages.controller';
import { EpcWorkspaceController } from '../epc-workspace.controller';
import { DesignPackagesService } from '../../../application/services/design-packages.service';
import { EpcWorkspaceService } from '../../../application/services/epc-workspace.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const taskDisciplineId = 'discipline-1';

const sessionItem = {
  id: 'session-1',
  packageName: 'Structural package',
  currentTier: 'REVIEWER',
  assigneeName: 'Jane Doe',
  slaDeadlineAt: new Date().toISOString(),
  slaOverdue: false,
  status: ReviewSessionStatus.ACTIVE,
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('Review sessions list endpoints', () => {
  describe('DesignPackagesController', () => {
    let app: INestApplication;
    let designPackagesService: { listReviewSessions: jest.Mock };

    beforeEach(async () => {
      designPackagesService = {
        listReviewSessions: jest.fn().mockResolvedValue({
          data: [sessionItem],
          meta: { total: 1, page: 1, limit: 20, pages: 1 },
        }),
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

    it('lists discipline review sessions defaulting to ACTIVE', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/projects/${projectId}/task-disciplines/${taskDisciplineId}/design-packages/review-sessions`,
        )
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(designPackagesService.listReviewSessions).toHaveBeenCalled();
    });
  });

  describe('EpcWorkspaceController', () => {
    let app: INestApplication;
    let epcWorkspaceService: { listProjectReviewSessions: jest.Mock };

    beforeEach(async () => {
      epcWorkspaceService = {
        listProjectReviewSessions: jest.fn().mockResolvedValue({
          data: [sessionItem],
          meta: { total: 1, page: 1, limit: 20, pages: 1 },
        }),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [EpcWorkspaceController],
        providers: [
          { provide: EpcWorkspaceService, useValue: epcWorkspaceService },
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

    it('lists project review sessions across disciplines', async () => {
      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/review-sessions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(epcWorkspaceService.listProjectReviewSessions).toHaveBeenCalledWith(
        { companyId: testUser.companyId, userId: testUser.userId },
        projectId,
        expect.anything(),
      );
    });
  });
});
