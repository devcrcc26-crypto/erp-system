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
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';
import { PmModuleSettingsService } from '../../../application/services/pm-module-settings.service';
import { ProjectExportService } from '../../../application/services/project-export.service';
import { ProjectsService } from '../../../application/services/projects.service';
import { ProjectsController } from '../projects.controller';
import { PmModuleEnabledGuard } from '../../guards/pm-module-enabled.guard';
import { EpcWorkspaceController } from '../epc-workspace.controller';
import { EpcWorkspaceService } from '../../../application/services/epc-workspace.service';
import { MyWorkService } from '../../../application/services/my-work.service';
import { ProjectChangeRequestService } from '../../../application/services/project-change-request.service';

const testUser = { userId: 'user-1', companyId: 'company-1', email: 'u@test.com', sessionId: 's-1' };

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('PmModuleEnabledGuard', () => {
  describe('ProjectsController', () => {
    let app: INestApplication;
    let isEnabled: jest.Mock;
    let getUserRoleNames: jest.Mock;

    beforeEach(async () => {
      isEnabled = jest.fn();
      getUserRoleNames = jest.fn();
      const projectsService = {
        listProjects: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } }),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          { provide: ProjectsService, useValue: projectsService },
          { provide: ProjectExportService, useValue: {} },
          PmModuleEnabledGuard,
          { provide: PmModuleSettingsService, useValue: { isEnabled } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(true), getUserRoleNames },
          },
          Reflector,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalGuards(new TestUserGuard());
      app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 404 for non-admin when PM is disabled', async () => {
      isEnabled.mockResolvedValue(false);
      getUserRoleNames.mockResolvedValue(['Employee']);

      await request(app.getHttpServer()).get('/projects').expect(404);
    });

    it('allows System Administrator when PM is disabled', async () => {
      isEnabled.mockResolvedValue(false);
      getUserRoleNames.mockResolvedValue(['System Administrator']);

      await request(app.getHttpServer()).get('/projects').expect(200);
    });

    it('allows any user when PM is enabled', async () => {
      isEnabled.mockResolvedValue(true);
      getUserRoleNames.mockResolvedValue(['Employee']);

      await request(app.getHttpServer()).get('/projects').expect(200);
    });
  });

  describe('EpcWorkspaceController global routes', () => {
    let app: INestApplication;
    let isEnabled: jest.Mock;
    let getUserRoleNames: jest.Mock;

    beforeEach(async () => {
      isEnabled = jest.fn();
      getUserRoleNames = jest.fn();

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [EpcWorkspaceController],
        providers: [
          { provide: EpcWorkspaceService, useValue: { getReviewInbox: jest.fn().mockResolvedValue([]) } },
          { provide: MyWorkService, useValue: { getMyWork: jest.fn().mockResolvedValue([]) } },
          { provide: ProjectChangeRequestService, useValue: {} },
          PmModuleEnabledGuard,
          { provide: PmModuleSettingsService, useValue: { isEnabled } },
          PermissionsGuard,
          {
            provide: PermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(true), getUserRoleNames },
          },
          Reflector,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalGuards(new TestUserGuard());
      app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('blocks /my-work with 404 when disabled for non-admin', async () => {
      isEnabled.mockResolvedValue(false);
      getUserRoleNames.mockResolvedValue(['Employee']);

      await request(app.getHttpServer()).get('/my-work').expect(404);
    });

    it('allows /review-inbox for admin when disabled', async () => {
      isEnabled.mockResolvedValue(false);
      getUserRoleNames.mockResolvedValue(['System Administrator']);

      await request(app.getHttpServer()).get('/review-inbox').expect(200);
    });
  });

  it('throws NotFoundException from guard when disabled', async () => {
    const guard = new PmModuleEnabledGuard(
      { isEnabled: async () => false } as PmModuleSettingsService,
      { getUserRoleNames: async () => ['Employee'] } as unknown as PermissionService,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: testUser }),
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });
});
