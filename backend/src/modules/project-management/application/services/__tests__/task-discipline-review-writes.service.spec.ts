import {
  ReviewTier,
  TaskDisciplineReviewStatus,
} from '@prisma/client';
import { ReviewWorkflowService } from '../review-workflow.service';

type UpsertInput = {
  companyId: string;
  taskDisciplineId: string;
  tier: ReviewTier;
  status: TaskDisciplineReviewStatus;
  actorId: string;
};

describe('ReviewWorkflowService TaskDisciplineReview writes', () => {
  const companyId = 'company-1';
  const actorId = 'user-1';
  const taskDisciplineId = 'discipline-1';

  let tx: { taskDisciplineReview: { upsert: jest.Mock } };
  let service: ReviewWorkflowService;

  const callUpsert = async (input: UpsertInput): Promise<void> => {
    const privateMethod = (
      service as unknown as {
        upsertTaskDisciplineReviewInTx: (
          client: typeof tx,
          input: UpsertInput,
        ) => Promise<void>;
      }
    ).upsertTaskDisciplineReviewInTx;
    await privateMethod.call(service, tx, input);
  };

  beforeEach(() => {
    tx = {
      taskDisciplineReview: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    service = new ReviewWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('creates APPROVED row for DISCIPLINE_OWNER tier', async () => {
    await callUpsert({
      companyId,
      taskDisciplineId,
      tier: ReviewTier.DISCIPLINE_OWNER,
      status: TaskDisciplineReviewStatus.APPROVED,
      actorId,
    });

    expect(tx.taskDisciplineReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskDisciplineId_reviewTier: {
            taskDisciplineId,
            reviewTier: ReviewTier.DISCIPLINE_OWNER,
          },
        },
        create: expect.objectContaining({
          status: TaskDisciplineReviewStatus.APPROVED,
          reviewedBy: actorId,
        }),
      }),
    );
  });

  it('creates IN_REVIEW row for REVIEWER tier', async () => {
    await callUpsert({
      companyId,
      taskDisciplineId,
      tier: ReviewTier.REVIEWER,
      status: TaskDisciplineReviewStatus.IN_REVIEW,
      actorId,
    });

    expect(tx.taskDisciplineReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: TaskDisciplineReviewStatus.IN_REVIEW,
          reviewedBy: null,
        }),
      }),
    );
  });

  it('sets RETURNED on current tier', async () => {
    await callUpsert({
      companyId,
      taskDisciplineId,
      tier: ReviewTier.REVIEWER,
      status: TaskDisciplineReviewStatus.RETURNED,
      actorId,
    });

    expect(tx.taskDisciplineReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: TaskDisciplineReviewStatus.RETURNED,
          reviewedBy: actorId,
        }),
      }),
    );
  });

  it('skips write when taskDisciplineId is missing', async () => {
    await callUpsert({
      companyId,
      taskDisciplineId: '',
      tier: ReviewTier.REVIEWER,
      status: TaskDisciplineReviewStatus.IN_REVIEW,
      actorId,
    });

    expect(tx.taskDisciplineReview.upsert).not.toHaveBeenCalled();
  });
});
