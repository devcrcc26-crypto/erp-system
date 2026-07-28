import { BadRequestException } from '@nestjs/common';
import { Submittal, SubmittalStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { SubmittalsService } from '../submittals.service';
import { PmContext } from '../../types/pm-context.type';

describe('Submittal status guard', () => {
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
      {} as never,
      { getUserRoleNames: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  it.each([
    SubmittalStatus.APPROVED,
    SubmittalStatus.APPROVED_WITH_COMMENTS,
    SubmittalStatus.REVISE_AND_RESUBMIT,
    SubmittalStatus.REJECTED,
  ])('PATCH with status %s throws BadRequestException', async (status) => {
    await expect(
      service.updateSubmittal(ctx, projectId, submittalId, { status }),
    ).rejects.toThrow(BadRequestException);
  });

  it('PATCH with status SUBMITTED from DRAFT succeeds', async () => {
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

  it('PATCH with status DRAFT from SUBMITTED succeeds (recall)', async () => {
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

  it('PATCH with status UNDER_REVIEW from SUBMITTED throws BadRequestException', async () => {
    const submitted = { ...existingSubmittal, status: SubmittalStatus.SUBMITTED };
    prisma.submittal.findFirst
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce({ status: SubmittalStatus.SUBMITTED });

    await expect(
      service.updateSubmittal(ctx, projectId, submittalId, {
        status: SubmittalStatus.UNDER_REVIEW,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
