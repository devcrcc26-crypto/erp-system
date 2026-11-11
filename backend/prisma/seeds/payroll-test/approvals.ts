import type { ApprovalsService } from '../../../src/modules/approvals/application/services/approvals.service';
import type { PrismaService } from '../../../src/shared/prisma/prisma.service';

export type ApprovalOutcome = 'APPROVED' | 'REJECTED' | 'RETURNED';

/**
 * Drives an approval request to a terminal state using real tier approvers.
 */
export async function driveApprovalToOutcome(
  approvals: ApprovalsService,
  prisma: PrismaService,
  approvalRequestId: string,
  outcome: ApprovalOutcome,
): Promise<void> {
  for (let guard = 0; guard < 8; guard += 1) {
    const request = await prisma.approvalRequest.findFirst({
      where: { id: approvalRequestId, deletedAt: null },
      include: { tiers: { orderBy: { tierOrder: 'asc' } } },
    });
    if (!request) {
      return;
    }
    if (
      request.status === 'APPROVED' ||
      request.status === 'REJECTED' ||
      request.status === 'RETURNED' ||
      request.status === 'CANCELLED'
    ) {
      return;
    }

    const tier = request.tiers.find((t) => t.tierOrder === request.currentTier);
    if (!tier) {
      return;
    }

    if (outcome === 'APPROVED') {
      await approvals.approveTier(
        request.id,
        tier.id,
        tier.approverId,
        'Payroll test seed approval',
      );
      continue;
    }
    if (outcome === 'REJECTED') {
      await approvals.rejectTier(
        request.id,
        tier.id,
        tier.approverId,
        'Payroll test seed rejection',
      );
      return;
    }
    await approvals.returnTier(
      request.id,
      tier.id,
      tier.approverId,
      'Payroll test seed return',
    );
    return;
  }
}

/**
 * Fully approves every pending tier on an approval request.
 */
export async function fullyApprove(
  approvals: ApprovalsService,
  prisma: PrismaService,
  approvalRequestId: string,
): Promise<void> {
  await driveApprovalToOutcome(
    approvals,
    prisma,
    approvalRequestId,
    'APPROVED',
  );
}
