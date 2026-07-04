import { ReviewSessionStatus, ReviewTier } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { NotificationService } from '../../../../notifications/application/services/notification.service';
import { EpcReviewRepository } from '../../../infrastructure/repositories/epc-review.repository';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';
import { ReviewSlaService } from '../review-sla.service';

describe('ReviewSlaService SLA notifications', () => {
  const companyId = 'company-1';
  const responsiblePersonId = 'pm-1';
  const sessionId = 'session-1';

  const overdueSession = {
    id: sessionId,
    companyId,
    designPackageId: 'package-1',
    taskDisciplineId: 'discipline-1',
    status: ReviewSessionStatus.ACTIVE,
    outcome: 'PENDING',
    currentTier: ReviewTier.REVIEWER,
    assignedToUserId: 'reviewer-1',
    openedAt: new Date('2026-06-01T00:00:00.000Z'),
    closedAt: null,
    closedReason: null,
    slaDeadlineAt: new Date('2026-06-20T00:00:00.000Z'),
    slaEscalatedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
  };

  let epcReviewRepository: {
    findOverdueActiveSessions: jest.Mock;
    markSessionSlaOverdue: jest.Mock;
  };
  let notificationService: { send: jest.Mock };
  let prisma: { reviewSession: { findFirst: jest.Mock } };
  let service: ReviewSlaService;

  beforeEach(() => {
    epcReviewRepository = {
      findOverdueActiveSessions: jest.fn(),
      markSessionSlaOverdue: jest.fn(),
    };
    notificationService = {
      send: jest.fn().mockResolvedValue({ inAppId: 'notification-1' }),
    };
    prisma = {
      reviewSession: {
        findFirst: jest.fn().mockResolvedValue({
          designPackage: {
            taskDiscipline: {
              task: {
                project: {
                  responsiblePersonId,
                },
              },
            },
          },
        }),
      },
    };

    service = new ReviewSlaService(
      epcReviewRepository as unknown as EpcReviewRepository,
      {} as unknown as EpcWorkflowRepository,
      prisma as unknown as PrismaService,
      notificationService as unknown as NotificationService,
    );
  });

  it('dispatches a notification to the responsible person for an overdue session', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    epcReviewRepository.findOverdueActiveSessions.mockResolvedValue([
      overdueSession,
    ]);
    epcReviewRepository.markSessionSlaOverdue.mockResolvedValue(overdueSession);

    await service.escalateOverdueSessions(companyId);

    expect(notificationService.send).toHaveBeenCalledWith(
      { companyId, userId: overdueSession.updatedBy },
      expect.objectContaining({
        recipientId: responsiblePersonId,
        eventType: 'review.sla_overdue',
        variables: expect.objectContaining({
          reviewSessionId: sessionId,
          currentTier: ReviewTier.REVIEWER,
          currentAssigneeUserId: 'reviewer-1',
          hoursOverdue: '108',
        }),
      }),
    );

    jest.useRealTimers();
  });

  it('includes the session ID and hours overdue in the notification payload', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    epcReviewRepository.findOverdueActiveSessions.mockResolvedValue([
      overdueSession,
    ]);
    epcReviewRepository.markSessionSlaOverdue.mockResolvedValue(overdueSession);

    await service.escalateOverdueSessions(companyId);

    const sendArgs = notificationService.send.mock.calls[0]?.[1];
    expect(sendArgs.variables.reviewSessionId).toBe(sessionId);
    expect(sendArgs.variables.hoursOverdue).toBe('48');

    jest.useRealTimers();
  });

  it('does not dispatch a notification when no sessions are overdue', async () => {
    epcReviewRepository.findOverdueActiveSessions.mockResolvedValue([]);

    await service.escalateOverdueSessions(companyId);

    expect(notificationService.send).not.toHaveBeenCalled();
    expect(epcReviewRepository.markSessionSlaOverdue).not.toHaveBeenCalled();
  });
});
