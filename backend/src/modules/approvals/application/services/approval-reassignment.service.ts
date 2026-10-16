import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalTierDecision } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { SYSTEM_ADMINISTRATOR_ROLE } from '../../../../shared/constants/protected-accounts';
import { isVacantApprover } from '../../../../shared/employment/vacant-approver.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';

type Ctx = { companyId: string; userId: string };

const PENDING_REQUEST_STATUSES = ['PENDING', 'SUBMITTED', 'IN_REVIEW'] as const;
const REASSIGN_ROLES = ['HR Manager', SYSTEM_ADMINISTRATOR_ROLE];

/** HR Manager / System Administrator moves a pending approval tier to another active user. */
@Injectable()
export class ApprovalReassignmentService {
  private readonly logger = new Logger(ApprovalReassignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async assertCanReassign(ctx: Ctx): Promise<void> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        role: { companyId: ctx.companyId, deletedAt: null, name: { in: REASSIGN_ROLES } },
      },
      select: { id: true },
    });
    if (roles.length === 0) {
      throw new ForbiddenException('Only an HR Manager or System Administrator can reassign approvals');
    }
  }

  async reassignTier(
    ctx: Ctx,
    tierId: string,
    newApproverId: string,
    reason: string,
    options: { skipPermissionCheck?: boolean } = {},
  ): Promise<{ tierId: string; requestId: string; approverId: string }> {
    if (!options.skipPermissionCheck) {
      await this.assertCanReassign(ctx);
    }
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 3) {
      throw new BadRequestException('A reason is required');
    }
    const tier = await this.prisma.approvalTier.findFirst({
      where: { id: tierId, request: { companyId: ctx.companyId, deletedAt: null } },
      include: {
        request: {
          select: { id: true, requestNumber: true, status: true, currentTier: true, requestedBy: true },
        },
      },
    });
    if (!tier) {
      throw new NotFoundException('Approval tier not found');
    }
    if (
      tier.decision !== ApprovalTierDecision.PENDING ||
      !(PENDING_REQUEST_STATUSES as readonly string[]).includes(tier.request.status)
    ) {
      throw new BadRequestException('Only pending approvals can be reassigned');
    }
    if (newApproverId === tier.approverId) {
      throw new BadRequestException('The tier is already assigned to this person');
    }
    if (newApproverId === tier.request.requestedBy) {
      throw new BadRequestException('A requester cannot approve their own request');
    }
    const newApprover = await this.prisma.user.findFirst({
      where: activeOnly({ id: newApproverId, companyId: ctx.companyId }),
      select: {
        id: true,
        isActive: true,
        employmentStatus: true,
        firstName: true,
        lastName: true,
        excludedFromHrProcesses: true,
      },
    });
    if (!newApprover || isVacantApprover(newApprover)) {
      throw new BadRequestException('The new approver must be an active employee');
    }
    if (!newApprover.excludedFromHrProcesses) {
      throw new BadRequestException(
        'The new approver must be an approver-only employee',
      );
    }

    await this.prisma.approvalTier.update({
      where: { id: tier.id },
      data: { approverId: newApproverId },
    });

    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'approvals',
        action: 'reassign_tier',
        recordType: 'approval_tier',
        recordId: tier.id,
        beforeValue: { approverId: tier.approverId },
        afterValue: { approverId: newApproverId, reason: trimmed, requestNumber: tier.request.requestNumber },
      }),
    );
    try {
      await this.notifications.send(ctx, {
        recipientId: newApproverId,
        eventType: 'approval.reassigned',
        subject: `Approval reassigned to you - ${tier.request.requestNumber}`,
        body: `You are now the approver for "${tier.label}" on ${tier.request.requestNumber}. Reason: ${trimmed}`,
        link: `/approvals/${tier.request.id}`,
      });
    } catch (error) {
      this.logger.warn(
        `Reassigned ${tier.id} but could not notify ${newApproverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { tierId: tier.id, requestId: tier.request.id, approverId: newApproverId };
  }
}
