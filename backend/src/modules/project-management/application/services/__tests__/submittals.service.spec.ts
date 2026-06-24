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
          'Submittal verdict must be set through the review endpoint, not direct update.',
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
      prisma.submittal.findFirst.mockResolvedValue(existingSubmittal);
      prisma.submittal.update.mockResolvedValue({
        ...existingSubmittal,
        status: SubmittalStatus.UNDER_REVIEW,
      });

      const result = await service.updateSubmittal(ctx, projectId, submittalId, {
        status: SubmittalStatus.UNDER_REVIEW,
      });

      expect(prisma.submittal.update).toHaveBeenCalledWith({
        where: { id: submittalId },
        data: expect.objectContaining({
          status: SubmittalStatus.UNDER_REVIEW,
          updatedBy: ctx.userId,
        }),
      });
      expect(result.status).toBe(SubmittalStatus.UNDER_REVIEW);
    });
  });
});
