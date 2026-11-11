import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RfisController } from '../rfis.controller';
import { RfisService } from '../../../application/services/rfis.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';
import { PmModuleAccessGuard } from '../../guards/pm-module-access.guard';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const rfiId = 'rfi-1';

const rfiResponse = {
  id: 'response-1',
  rfiId,
  responseText: 'Use footing depth per drawing A-101.',
  respondedBy: testUser.userId,
  respondedAt: new Date().toISOString(),
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

class AllowAllPmModuleGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('RfisController', () => {
  let app: INestApplication;
  let rfisService: {
    addRfiResponse: jest.Mock;
    deleteRfi: jest.Mock;
  };
  let hasPermission: jest.Mock;

  beforeEach(async () => {
    rfisService = {
      addRfiResponse: jest.fn().mockResolvedValue(rfiResponse),
      deleteRfi: jest.fn().mockResolvedValue(undefined),
    };
    hasPermission = jest.fn().mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RfisController],
      providers: [
        { provide: RfisService, useValue: rfisService },
        PermissionsGuard,
        { provide: PermissionService, useValue: { hasPermission } },
        Reflector,
      ],
    })
      .overrideGuard(PmModuleAccessGuard)
      .useClass(AllowAllPmModuleGuard)
      .compile();

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

  it('delegates POST response permission to the service (no RBAC edit required)', async () => {
    hasPermission.mockResolvedValue(false);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/rfis/${rfiId}/responses`)
      .send({ responseText: 'Use footing depth per drawing A-101.' })
      .expect(201);

    expect(rfisService.addRfiResponse).toHaveBeenCalled();
  });

  it('returns 403 when user lacks rfis.delete on DELETE', async () => {
    hasPermission.mockResolvedValue(false);

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/rfis/${rfiId}`)
      .expect(403);

    expect(rfisService.deleteRfi).not.toHaveBeenCalled();
  });
});
