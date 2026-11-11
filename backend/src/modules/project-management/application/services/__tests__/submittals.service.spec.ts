import {
  BadRequestException,
} from '@nestjs/common';
import { Submittal, SubmittalStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ExternalReviewTriggerService } from '../external-review-trigger.service';
import { SubmittalsService } from '../submittals.service';
import { WorkflowKernelService } from '../workflow-kernel.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';
import { TaskAccessScopeService } from '../task-access-scope.service';

describe('SubmittalsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const submittalId = 'submittal-1';
  const reviewerUserId = 'reviewer-1';

  const existingSubmittal = {
    id: submittalId,
    projectId,
    status: SubmittalStatus.DRAFT,
    submittalPurpose: null,
    submittedBy: ctx.userId,
    assignedTo: reviewerUserId,
    taskDisciplineId: null,
    submittalNumber: 'SUB-00001',
    title: 'Structural steel shop drawings',
    category: 'Structural',
    contractor: null,
    supplier: null,
    specReference: null,
    revisionNumber: 1,
    dueDate: null,
    reviewDate: null,
    submissionDate: null,
    issuedAt: null,
    reviewedBy: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  } as Submittal;

  let prisma: {
    submittal: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    submittalItem: { findMany: jest.Mock };
    submittalReview: { create: jest.Mock };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let workflowKernel: { execute: jest.Mock };
  let externalReviewTrigger: { recordFromSubmittalReview: jest.Mock };
  let taskAccessScopeService: { resolveProfile: jest.Mock };
  let service: SubmittalsService;

  beforeEach(() => {
    prisma = {
      submittal: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      submittalItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      submittalReview: {
        create: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: reviewerUserId,
            firstName: 'Review',
            lastName: 'Er',
            chineseName: null,
          },
        ]),
      },
      $transaction: jest.fn(),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    workflowKernel = {
      execute: jest.fn(),
    };

    externalReviewTrigger = {
      recordFromSubmittalReview: jest.fn().mockResolvedValue(undefined),
    };

    taskAccessScopeService = {
      resolveProfile: jest.fn().mockResolvedValue({
        hasFullProjectAccess: true,
      }),
    };

    service = new SubmittalsService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        getNextNumber: jest.fn().mockResolvedValue('SUB-00001'),
      } as unknown as DocumentNumberService,
      workflowKernel as unknown as WorkflowKernelService,
      externalReviewTrigger as unknown as ExternalReviewTriggerService,
      {
        ensureSubmittalFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/submittals/SUB-00001' }),
      } as unknown as EngineeringDocumentFolderService,
      {} as never,
      taskAccessScopeService as unknown as TaskAccessScopeService,
      { getUserRoleNames: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  describe('createSubmittal', () => {
    it('scopes creation to the project and company context', async () => {
      prisma.submittal.create.mockResolvedValue(existingSubmittal);

      await service.createSubmittal(ctx, projectId, {
        category: 'Structural',
        title: 'Structural steel shop drawings',
      });

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(prisma.submittal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          submittedBy: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }),
      });
    });
  });

  describe('addReview', () => {
    it('creates SubmittalReview and updates parent status', async () => {
      const submitted = {
        ...existingSubmittal,
        status: SubmittalStatus.SUBMITTED,
      };
      prisma.submittal.findFirst.mockResolvedValue(submitted);
      prisma.$transaction.mockImplementation(
        async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
      );
      prisma.submittalReview.create.mockResolvedValue({
        id: 'review-1',
        submittalId,
        reviewedBy: reviewerUserId,
        revisionNumber: 1,
        status: SubmittalStatus.APPROVED,
        comments: 'Approved as submitted',
        reviewedAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      prisma.submittal.update.mockResolvedValue({
        ...submitted,
        status: SubmittalStatus.APPROVED,
      });

      const result = await service.addReview(
        { ...ctx, userId: reviewerUserId },
        projectId,
        submittalId,
        {
          status: SubmittalStatus.APPROVED,
          comments: 'Approved as submitted',
        },
      );

      expect(prisma.submittalReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          submittalId,
          reviewedBy: reviewerUserId,
          status: SubmittalStatus.APPROVED,
        }),
      });
      expect(prisma.submittal.update).toHaveBeenCalledWith({
        where: { id: submittalId },
        data: expect.objectContaining({
          status: SubmittalStatus.APPROVED,
          reviewedBy: reviewerUserId,
        }),
      });
      expect(result.status).toBe(SubmittalStatus.APPROVED);
    });
  });

  describe('updateSubmittal', () => {
    it('rejects APPROVED status via direct PATCH', async () => {
      await expect(
        service.updateSubmittal(ctx, projectId, submittalId, {
          status: SubmittalStatus.APPROVED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Submittal verdict status must be set through the review endpoint, not direct update.',
        ),
      );

      expect(prisma.submittal.findFirst).not.toHaveBeenCalled();
    });

    it('rejects REJECTED status via direct PATCH', async () => {
      await expect(
        service.updateSubmittal(ctx, projectId, submittalId, {
          status: SubmittalStatus.REJECTED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Submittal verdict status must be set through the review endpoint, not direct update.',
        ),
      );

      expect(prisma.submittal.findFirst).not.toHaveBeenCalled();
    });

    it('allows DRAFT to SUBMITTED transition', async () => {
      prisma.submittal.findFirst
        .mockResolvedValueOnce(existingSubmittal)
        .mockResolvedValueOnce({ status: SubmittalStatus.DRAFT });
      prisma.submittal.update.mockResolvedValue({
        ...existingSubmittal,
        status: SubmittalStatus.SUBMITTED,
      });

      const result = await service.updateSubmittal(ctx, projectId, submittalId, {
        status: SubmittalStatus.SUBMITTED,
      });

      expect(result.status).toBe(SubmittalStatus.SUBMITTED);
    });
  });

  describe('batchIssue', () => {
    it('requires all submittals to be in SUBMITTED status before batch issue', async () => {
      prisma.submittal.findFirst.mockResolvedValue({
        ...existingSubmittal,
        status: SubmittalStatus.DRAFT,
      });

      await expect(
        service.batchIssue(ctx, projectId, { submittalIds: [submittalId] }),
      ).rejects.toThrow(
        new BadRequestException(
          'Only submittals in SUBMITTED status can be issued.',
        ),
      );

      expect(workflowKernel.execute).not.toHaveBeenCalled();
    });

    it('issues each SUBMITTED submittal through the workflow kernel', async () => {
      prisma.submittal.findFirst.mockResolvedValue({
        ...existingSubmittal,
        status: SubmittalStatus.SUBMITTED,
      });
      workflowKernel.execute.mockResolvedValue({
        commandType: 'IssueSubmittal',
        submittalId,
      });

      const results = await service.batchIssue(ctx, projectId, {
        submittalIds: [submittalId],
      });

      expect(prisma.submittal.findFirst).toHaveBeenCalledWith({
        where: { id: submittalId, projectId, deletedAt: null },
      });
      expect(workflowKernel.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'IssueSubmittal',
          companyId: ctx.companyId,
          actorId: ctx.userId,
          submittalId,
        }),
      );
      expect(results).toHaveLength(1);
    });
  });
});
