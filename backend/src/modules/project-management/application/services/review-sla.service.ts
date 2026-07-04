import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  ReviewSession,
  ReviewTier,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { REVIEW_TIER_ORDER } from '../../domain/contracts/enums/review-tier.enum';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import { EpcWorkflowRepository } from '../../infrastructure/repositories/epc-workflow.repository';

/** Default SLA hours per review tier (v1). */
export const DEFAULT_SLA_HOURS: Readonly<Record<ReviewTier, number>> = {
  [ReviewTier.DISCIPLINE_OWNER]: 24,
  [ReviewTier.REVIEWER]: 48,
  [ReviewTier.DISCIPLINE_LEAD]: 72,
  [ReviewTier.DEPT_CHIEF]: 120,
  [ReviewTier.INSTITUTE_CHIEF]: 120,
};

export interface SlaEscalationResult {
  readonly reviewSessionId: string;
  readonly currentTier: ReviewTier;
  readonly assignedToUserId: string | null;
  readonly hoursOverdue: number;
}

/**
 * SLA escalation engine - visibility only, never blocks workflow.
 */
@Injectable()
export class ReviewSlaService {
  private readonly logger = new Logger(ReviewSlaService.name);

  constructor(
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Computes SLA deadline from tier and session open time.
   */
  computeDeadline(openedAt: Date, tier: ReviewTier): Date {
    const hours = DEFAULT_SLA_HOURS[tier];
    return new Date(openedAt.getTime() + hours * 60 * 60 * 1000);
  }

  /**
   * Returns next tier in governance chain, or null at dept chief.
   */
  getNextTier(current: ReviewTier): ReviewTier | null {
    const index = REVIEW_TIER_ORDER.indexOf(current as never);
    if (index < 0 || index >= REVIEW_TIER_ORDER.length - 1) {
      return null;
    }
    return REVIEW_TIER_ORDER[index + 1] as ReviewTier;
  }

  /**
   * Resolves assignee user for a review tier from discipline assignments.
   */
  resolveAssigneeForTier(
    tier: ReviewTier,
    discipline: {
      ownerUserId: string | null;
      reviewerUserId: string | null;
      disciplineLeadUserId: string | null;
      chiefUserId: string | null;
      instituteChiefUserId?: string | null;
    },
  ): string | null {
    switch (tier) {
      case ReviewTier.DISCIPLINE_OWNER:
        return discipline.ownerUserId;
      case ReviewTier.REVIEWER:
        return discipline.reviewerUserId;
      case ReviewTier.DISCIPLINE_LEAD:
        return discipline.disciplineLeadUserId;
      case ReviewTier.DEPT_CHIEF:
        return discipline.chiefUserId;
      case ReviewTier.INSTITUTE_CHIEF:
        return discipline.instituteChiefUserId ?? null;
      default:
        return null;
    }
  }

  /**
   * Flags overdue active sessions for visibility - never changes governance tier or assignee.
   */
  async escalateOverdueSessions(companyId: string): Promise<SlaEscalationResult[]> {
    const now = new Date();
    const overdue = await this.epcReviewRepository.findOverdueActiveSessions(
      companyId,
      now,
    );
    const results: SlaEscalationResult[] = [];

    for (const session of overdue) {
      await this.epcReviewRepository.markSessionSlaOverdue(
        session.id,
        now,
        session.updatedBy,
      );

      const hoursOverdue = this.computeHoursOverdue(session.slaDeadlineAt, now);

      await this.dispatchSlaOverdueNotification(companyId, session, hoursOverdue);

      this.logger.warn(
        `SLA overdue for session ${session.id} tier=${session.currentTier} assignee=${session.assignedToUserId} hoursOverdue=${hoursOverdue}`,
      );

      if (this.getNextTier(session.currentTier) === null) {
        this.logger.warn(
          `SLA overdue at final tier for session ${session.id} - PMO alert only`,
        );
      }

      results.push({
        reviewSessionId: session.id,
        currentTier: session.currentTier,
        assignedToUserId: session.assignedToUserId,
        hoursOverdue,
      });
    }

    return results;
  }

  /**
   * Processes overdue sessions across all companies (worker or sync fallback).
   */
  async runHourlyEscalation(): Promise<void> {
    const now = new Date();
    const overdue = await this.epcReviewRepository.findAllOverdueActiveSessions(now);
    const companyIds = [...new Set(overdue.map((s) => s.companyId))];

    for (const companyId of companyIds) {
      const escalations = await this.escalateOverdueSessions(companyId);
      if (escalations.length > 0) {
        this.logger.log(
          `SLA escalated ${escalations.length} session(s) for company ${companyId}`,
        );
      }
    }
  }

  private computeHoursOverdue(
    slaDeadlineAt: Date | null,
    asOf: Date,
  ): number {
    if (!slaDeadlineAt) {
      return 0;
    }
    return Math.max(
      0,
      Math.round((asOf.getTime() - slaDeadlineAt.getTime()) / (1000 * 60 * 60)),
    );
  }

  private async dispatchSlaOverdueNotification(
    companyId: string,
    session: ReviewSession,
    hoursOverdue: number,
  ): Promise<void> {
    const responsiblePersonId = await this.resolveResponsiblePersonId(
      companyId,
      session.id,
    );
    if (!responsiblePersonId) {
      this.logger.warn(
        `No responsible person found for SLA overdue session ${session.id}`,
      );
      return;
    }

    const payload = {
      reviewSessionId: session.id,
      currentTier: session.currentTier,
      currentAssigneeUserId: session.assignedToUserId,
      hoursOverdue,
    };

    if (this.notificationService) {
      await this.notificationService.send(
        { companyId, userId: session.updatedBy },
        {
          recipientId: responsiblePersonId,
          eventType: 'review.sla_overdue',
          subject: 'Review session SLA overdue',
          body: JSON.stringify(payload),
          variables: {
            reviewSessionId: session.id,
            currentTier: session.currentTier,
            currentAssigneeUserId: session.assignedToUserId ?? '',
            hoursOverdue: String(hoursOverdue),
          },
        },
      );
      return;
    }

    if (!this.prisma) {
      return;
    }

    await this.prisma.notification.create({
      data: {
        companyId,
        recipientId: responsiblePersonId,
        channel: NotificationChannel.IN_APP,
        subject: 'Review session SLA overdue',
        body: JSON.stringify(payload),
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  private async resolveResponsiblePersonId(
    companyId: string,
    reviewSessionId: string,
  ): Promise<string | null> {
    if (!this.prisma) {
      return null;
    }

    const row = await this.prisma.reviewSession.findFirst({
      where: activeOnly({ id: reviewSessionId, companyId }),
      select: {
        designPackage: {
          select: {
            taskDiscipline: {
              select: {
                task: {
                  select: {
                    project: {
                      select: { responsiblePersonId: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return (
      row?.designPackage.taskDiscipline.task.project.responsiblePersonId ?? null
    );
  }
}
