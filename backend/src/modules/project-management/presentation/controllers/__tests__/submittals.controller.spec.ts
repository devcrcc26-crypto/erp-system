import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { SubmittalStatus } from '@prisma/client';
import request from 'supertest';
import { SubmittalsController } from '../submittals.controller';
import { SubmittalsService } from '../../../application/services/submittals.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const submittalId = 'submittal-1';

const submittalReview = {
  id: 'review-1',
  submittalId,
  status: SubmittalStatus.APPROVED,
  comments: 'Approved as submitted',
  reviewedBy: testUser.userId,
  reviewedAt: new Date().toISOString(),
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('SubmittalsController', () => {
  let app: INestApplication;
  let submittalsService: {
    addReview: jest.Mock;
  };
  let hasPermission: jest.Mock;

  beforeEach(async () => {
    submittalsService = {
      addReview: jest.fn().mockResolvedValue(submittalReview),
    };
    hasPermission = jest.fn().mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubmittalsController],
      providers: [
        { provide: SubmittalsService, useValue: submittalsService },
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

  it('returns 403 when user has submittals.view but not submittals.edit on POST review', async () => {
    hasPermission.mockImplementation(
      async (
        _userId: string,
        _companyId: string,
        module: string,
        action: string,
      ) => module === 'submittals' && action === 'view',
    );

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/submittals/${submittalId}/reviews`)
      .send({
        status: SubmittalStatus.APPROVED,
        comments: 'Approved as submitted',
      })
      .expect(403);

    expect(submittalsService.addReview).not.toHaveBeenCalled();
  });
});
