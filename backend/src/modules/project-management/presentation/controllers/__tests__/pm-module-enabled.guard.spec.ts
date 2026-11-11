import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
  type Type,
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
import { SubmittalsController } from '../submittals.controller';
import { SubmittalsService } from '../../../application/services/submittals.service';
import { PmModuleEnabledGuard } from '../../guards/pm-module-enabled.guard';
import { PmModuleAccessGuard } from '../../guards/pm-module-access.guard';
import { EpcWorkspaceController } from '../epc-workspace.controller';
import { EpcWorkspaceService } from '../../../application/services/epc-workspace.service';
import { MyWorkService } from '../../../application/services/my-work.service';
import { ProjectChangeRequestService } from '../../../application/services/project-change-request.service';

const testUser = {
  userId: 'user-1',
  companyId: 'company-1',
  email: 'u@test.com',
  sessionId: 's-1',
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

class AllowPmModuleAccessGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

interface PmGuardHarness {
  app: INestApplication;
  isEnabled: jest.Mock;
  getUserRoleNames: jest.Mock;
}

async function createPmGuardHarness(
  controller: Type,
  extraProviders: unknown[],
  overridePmModuleAccess: boolean,
): Promise<PmGuardHarness> {
  const isEnabled = jest.fn();
  const getUserRoleNames = jest.fn();

  let moduleBuilder = Test.createTestingModule({
    controllers: [controller],
    providers: [
      ...(extraProviders as []),
      PmModuleEnabledGuard,
      { provide: PmModuleSettingsService, useValue: { isEnabled } },
      PermissionsGuard,
      {
        provide: PermissionService,
        useValue: {
          hasPermission: jest.fn().mockResolvedValue(true),
          getUserRoleNames,
        },
      },
      Reflector,
    ],
  });

  if (overridePmModuleAccess) {
    moduleBuilder = moduleBuilder
      .overrideGuard(PmModuleAccessGuard)
      .useClass(AllowPmModuleAccessGuard);
  }

  const moduleRef: TestingModule = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalGuards(new TestUserGuard());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  await app.init();

  return { app, isEnabled, getUserRoleNames };
}

function assertPmModuleMatrix(
  harness: () => PmGuardHarness,
  getPath: () => string,
): void {
  it('disabled + non-sysadmin → 404', async () => {
    const { app, isEnabled, getUserRoleNames } = harness();
    isEnabled.mockResolvedValue(false);
    getUserRoleNames.mockResolvedValue(['Employee']);

    await request(app.getHttpServer()).get(getPath()).expect(404);
  });

  it('disabled + sysadmin → 200', async () => {
    const { app, isEnabled, getUserRoleNames } = harness();
    isEnabled.mockResolvedValue(false);
    getUserRoleNames.mockResolvedValue(['System Administrator']);

    await request(app.getHttpServer()).get(getPath()).expect(200);
  });

  it('enabled + non-sysadmin → 200 (passes to next guard)', async () => {
    const { app, isEnabled, getUserRoleNames } = harness();
    isEnabled.mockResolvedValue(true);
    getUserRoleNames.mockResolvedValue(['Employee']);

    await request(app.getHttpServer()).get(getPath()).expect(200);
  });
}

describe('PmModuleEnabledGuard — controller groups', () => {
  describe('ProjectsController GET /projects', () => {
    let harness: PmGuardHarness;

    beforeEach(async () => {
      harness = await createPmGuardHarness(
        ProjectsController,
        [
          {
            provide: ProjectsService,
            useValue: {
              listProjects: jest.fn().mockResolvedValue({
                data: [],
                meta: { total: 0, page: 1, limit: 20, pages: 0 },
              }),
            },
          },
          { provide: ProjectExportService, useValue: {} },
        ],
        false,
      );
    });

    afterEach(async () => {
      await harness.app.close();
    });

    assertPmModuleMatrix(() => harness, () => '/projects');
  });

  describe('SubmittalsController GET /projects/:projectId/submittals', () => {
    const projectId = 'project-1';
    let harness: PmGuardHarness;

    beforeEach(async () => {
      harness = await createPmGuardHarness(
        SubmittalsController,
        [
          {
            provide: SubmittalsService,
            useValue: {
              listSubmittals: jest.fn().mockResolvedValue([]),
            },
          },
        ],
        true,
      );
    });

    afterEach(async () => {
      await harness.app.close();
    });

    assertPmModuleMatrix(
      () => harness,
      () => `/projects/${projectId}/submittals`,
    );
  });

  describe('EpcWorkspaceController GET /my-work', () => {
    let harness: PmGuardHarness;

    beforeEach(async () => {
      harness = await createPmGuardHarness(
        EpcWorkspaceController,
        [
          { provide: EpcWorkspaceService, useValue: {} },
          {
            provide: MyWorkService,
            useValue: {
              getMyWork: jest.fn().mockResolvedValue([]),
            },
          },
          { provide: ProjectChangeRequestService, useValue: {} },
        ],
        false,
      );
    });

    afterEach(async () => {
      await harness.app.close();
    });

    assertPmModuleMatrix(() => harness, () => '/my-work');
  });
});
