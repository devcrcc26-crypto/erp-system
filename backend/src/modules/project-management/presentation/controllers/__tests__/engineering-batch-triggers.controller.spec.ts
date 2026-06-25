import {
  INestApplication,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ExternalReviewTriggerStatus } from '@prisma/client';
import request from 'supertest';
import { EngineeringBatchController } from '../engineering-batch.controller';
import { ExternalReviewTriggerService } from '../../../application/services/external-review-trigger.service';
import { DesignPackagesService } from '../../../application/services/design-packages.service';
import { DecisionTraceService } from '../../../application/services/decision-trace.service';
import { EngineeringDocumentsService } from '../../../application/services/engineering-documents.service';
import { RevisionOrchestratorService } from '../../../application/services/revision-orchestrator.service';
import { WorkflowKernelService } from '../../../application/services/workflow-kernel.service';
import { PermissionsGuard } from '../../../../../shared/permissions/permissions.guard';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { ResponseEnvelopeInterceptor } from '../../../../../shared/interceptors/response-envelope.interceptor';

const testUser = { userId: 'user-1', companyId: 'company-1' };
const projectId = 'project-1';
const triggerId = 'trigger-1';

const pendingTrigger = {
  id: triggerId,
  projectId,
  triggerType: 'SUBMITTAL_REVIEW',
  sourceEntityType: 'SubmittalReview',
  sourceEntityId: 'review-1',
  submittalId: 'submittal-1',
  status: ExternalReviewTriggerStatus.PENDING,
  createdAt: new Date().toISOString(),
};

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: typeof testUser }>();
    req.user = testUser;
    return true;
  }
}

describe('EngineeringBatchController revision triggers', () => {
  let app: INestApplication;
  let triggerService: {
    listTriggers: jest.Mock;
    getTrigger: jest.Mock;
  };

  beforeEach(async () => {
    triggerService = {
      listTriggers: jest.fn().mockResolvedValue({
        data: [pendingTrigger],
        meta: { total: 1, page: 1, limit: 20, pages: 1 },
      }),
      getTrigger: jest.fn().mockResolvedValue(pendingTrigger),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EngineeringBatchController],
      providers: [
        { provide: ExternalReviewTriggerService, useValue: triggerService },
        { provide: DesignPackagesService, useValue: {} },
        { provide: DecisionTraceService, useValue: {} },
        { provide: EngineeringDocumentsService, useValue: {} },
        { provide: RevisionOrchestratorService, useValue: {} },
        { provide: WorkflowKernelService, useValue: {} },
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

  it('lists triggers defaulting to PENDING', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/revision-triggers`)
      .expect(200);

    expect(triggerService.listTriggers).toHaveBeenCalledWith(
      { companyId: testUser.companyId, userId: testUser.userId },
      projectId,
      expect.objectContaining({}),
    );
  });

  it('lists triggers with status=PROCESSED', async () => {
    triggerService.listTriggers.mockResolvedValue({
      data: [{ ...pendingTrigger, status: ExternalReviewTriggerStatus.PROCESSED }],
      meta: { total: 1, page: 1, limit: 20, pages: 1 },
    });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/revision-triggers`)
      .query({ status: 'PROCESSED' })
      .expect(200);

    expect(triggerService.listTriggers).toHaveBeenCalledWith(
      expect.anything(),
      projectId,
      expect.objectContaining({ status: 'PROCESSED' }),
    );
  });

  it('returns a single trigger with source fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/revision-triggers/${triggerId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sourceEntityId).toBe('review-1');
    expect(response.body.data.triggerType).toBe('SUBMITTAL_REVIEW');
    expect(triggerService.getTrigger).toHaveBeenCalled();
  });
});
