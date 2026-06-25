import { BadRequestException } from '@nestjs/common';
import { Submittal, SubmittalStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { SubmittalsService } from '../submittals.service';
import { PmContext } from '../../types/pm-context.type';

describe('SubmittalsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const submittalId = 'submittal-1';

  const existingSubmittal = {
    id: submittalId,
    projectId,
    status: SubmittalStatus.DRAFT,
    title: 'Original title',
    category: 'Structural',
    contractor: null,
    supplier: null,
    specReference: null,
    revisionNumber: 1,
    dueDate: null,
    reviewDate: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Submittal;

  let prisma: {
    submittal: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: SubmittalsService;

  beforeEach(() => {
    prisma = {
      submittal: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new SubmittalsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('updateSubmittal', () => {
    it.each([
      SubmittalStatus.APPROVED,
      SubmittalStatus.APPROVED_WITH_COMMENTS,
      SubmittalStatus.REVISE_AND_RESUBMIT,
      SubmittalStatus.REJECTED,
    ])('throws BadRequestException when status is %s', async (status) => {
      await expect(
        service.updateSubmittal(ctx, projectId, submittalId, { status }),
      ).rejects.toThrow(
        new BadRequestException(
          'Submittal verdict status must be set through the review endpoint, not direct update.',
        ),
      );

      expect(prisma.submittal.findFirst).not.toHaveBeenCalled();
      expect(prisma.submittal.update).not.toHaveBeenCalled();
    });

    it('succeeds when updating a non-verdict field without status', async () => {
      prisma.submittal.findFirst.mockResolvedValue(existingSubmittal);
      prisma.submittal.update.mockResolvedValue({
        ...existingSubmittal,
        title: 'Updated title',
      });

      const result = await service.updateSubmittal(ctx, projectId, submittalId, {
        title: 'Updated title',
      });

      expect(prisma.submittal.findFirst).toHaveBeenCalledWith({
        where: { id: submittalId, projectId, deletedAt: null },
      });
      expect(prisma.submittal.update).toHaveBeenCalledWith({
        where: { id: submittalId },
        data: expect.objectContaining({
          title: 'Updated title',
          updatedBy: ctx.userId,
        }),
      });
      expect(result.title).toBe('Updated title');
    });

    it('succeeds when updating status to a non-verdict value', async () => {
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

    it('throws BadRequestException for SUBMITTED → UNDER_REVIEW via PATCH', async () => {
      prisma.submittal.findFirst
        .mockResolvedValueOnce(existingSubmittal)
        .mockResolvedValueOnce({ status: SubmittalStatus.SUBMITTED });

      await expect(
        service.updateSubmittal(ctx, projectId, submittalId, {
          status: SubmittalStatus.UNDER_REVIEW,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid submittal status transition from SUBMITTED to UNDER_REVIEW.',
        ),
      );
    });

    it('throws BadRequestException for DRAFT → UNDER_REVIEW via PATCH', async () => {
      prisma.submittal.findFirst
        .mockResolvedValueOnce(existingSubmittal)
        .mockResolvedValueOnce({ status: SubmittalStatus.DRAFT });

      await expect(
        service.updateSubmittal(ctx, projectId, submittalId, {
          status: SubmittalStatus.UNDER_REVIEW,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid submittal status transition from DRAFT to UNDER_REVIEW.',
        ),
      );
    });

    it('succeeds when recalling SUBMITTED to DRAFT', async () => {
      const submitted = { ...existingSubmittal, status: SubmittalStatus.SUBMITTED };
      prisma.submittal.findFirst
        .mockResolvedValueOnce(submitted)
        .mockResolvedValueOnce({ status: SubmittalStatus.SUBMITTED });
      prisma.submittal.update.mockResolvedValue({
        ...submitted,
        status: SubmittalStatus.DRAFT,
      });

      const result = await service.updateSubmittal(ctx, projectId, submittalId, {
        status: SubmittalStatus.DRAFT,
      });

      expect(result.status).toBe(SubmittalStatus.DRAFT);
    });
  });
});
