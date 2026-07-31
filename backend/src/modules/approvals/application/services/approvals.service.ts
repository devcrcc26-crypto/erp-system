import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  ListRequestsDto,
  SubmitRequestDto,
} from '../dtos/approval.dtos';
import type { ApprovalFinalDecision } from '../ports/approval-decision.listener';
import { ApprovalDecisionRegistry } from './approval-decision-registry.service';
import {
  ApprovalResolverService,
  type MatchedApprovalRule,
} from './approval-resolver.service';

const APPROVAL_RETURNED_EVENT = 'approval.returned';
const APPROVAL_PENDING_EVENT = 'approval.pending';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const REQUEST_DETAIL_INCLUDE = {
  category: true,
  requester: { select: USER_SELECT },
  tiers: {
    include: { approver: { select: USER_SELECT } },
    orderBy: { tierOrder: 'asc' as const },
  },
  comments: {
    include: { commenter: { select: USER_SELECT } },
    orderBy: { createdAt: 'asc' as const },
  },
  attachmentFolder: {
    select: { id: true, name: true, path: true },
  },
  leaveRequest: { select: { id: true } },
  overtimeRequest: { select: { id: true } },
} as const;

/** Interactive transaction options — leave/overtime submit must not hit the 5s default. */
const PRISMA_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export interface TierCondition {
  text: string;
  resolved: boolean;
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

/**
 * Application service for approval categories and request workflow.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ApprovalResolverService,
    private readonly notificationService: NotificationService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
  ) {}

  /**
   * Lists active approval categories for the company.
   */
  async getCategories(companyId: string): Promise<unknown[]> {
    return this.prisma.approvalCategory.findMany({
      where: activeOnly({ companyId, isActive: true }),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Returns a single active category by code, including tier rule config.
   */
  async getCategoryByCode(code: string, companyId: string): Promise<unknown> {
    const category = await this.prisma.approvalCategory.findFirst({
      where: activeOnly({ companyId, code, isActive: true }),
    });
    if (!category) {
      throw new NotFoundException(`Approval category "${code}" not found`);
    }
    return category;
  }

  /**
   * Creates an approval request and materialises resolved tiers. Status PENDING.
   * Pass `resolvedTiers` to skip category rule resolution (e.g. leave org chain).
   */
  async submitRequest(
    dto: SubmitRequestDto,
    companyId: string,
    userId: string,
    options?: { resolvedTiers?: MatchedApprovalRule },
  ): Promise<unknown> {
    const category = await this.prisma.approvalCategory.findFirst({
      where: activeOnly({
        companyId,
        code: dto.categoryCode,
        isActive: true,
      }),
    });
    if (!category) {
      throw new NotFoundException(
        `Approval category "${dto.categoryCode}" not found`,
      );
    }

    if (dto.documentFolderId) {
      const folder = await this.prisma.documentFolder.findFirst({
        where: activeOnly({ id: dto.documentFolderId, companyId }),
        select: { id: true },
      });
      if (!folder) {
        throw new NotFoundException('Document folder not found');
      }
    }

    if (dto.documentIds && dto.documentIds.length > 0) {
      const docs = await this.prisma.document.findMany({
        where: activeOnly({
          companyId,
          id: { in: dto.documentIds },
        }),
        select: { id: true },
      });
      if (docs.length !== dto.documentIds.length) {
        throw new BadRequestException(
          'One or more documentIds are invalid for this company',
        );
      }
    }

    const matched =
      options?.resolvedTiers ??
      (await this.resolver.resolveRule(
        companyId,
        userId,
        category.approvalRules,
        dto.formData,
      ));

    if (!matched.tiers || matched.tiers.length === 0) {
      throw new BadRequestException('Approval chain has no tiers');
    }

    const requestNumber = await this.nextRequestNumber(category.numberPrefix);
    const now = new Date();
    const formData: Prisma.InputJsonValue = {
      ...dto.formData,
      ...(dto.documentIds ? { _documentIds: dto.documentIds } : {}),
    };

    const created = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const request = await tx.approvalRequest.create({
          data: {
            id: randomUUID(),
            companyId,
            categoryId: category.id,
            requestNumber,
            title: dto.title,
            formData,
            requestedBy: userId,
            status: ApprovalRequestStatus.PENDING,
            currentTier: matched.tiers[0].tierOrder,
            matchedRuleName: matched.ruleName,
            submittedAt: now,
            attachmentFolderId: dto.documentFolderId ?? null,
            createdBy: userId,
            updatedBy: userId,
            tiers: {
              create: matched.tiers.map((tier) => ({
                id: randomUUID(),
                tierOrder: tier.tierOrder,
                label: tier.label,
                approverId: tier.approverId,
                resolver: tier.resolver,
                decision: ApprovalTierDecision.PENDING,
                conditions: [],
              })),
            },
          },
          select: {
            id: true,
            requestNumber: true,
          },
        });
        return request;
      },
      PRISMA_TX_OPTIONS,
    );

    const detailed = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: created.id, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });

    const firstApproverId = matched.tiers[0]?.approverId;
    if (firstApproverId && firstApproverId !== userId) {
      await this.notifySafe(companyId, userId, {
        recipientId: firstApproverId,
        eventType: APPROVAL_PENDING_EVENT,
        subject: `Approval required — ${created.requestNumber}`,
        body: `${dto.title} (${created.requestNumber}) is awaiting your approval.`,
        link: `/approval-requests/${created.id}`,
        variables: {
          requestId: created.id,
          requestNumber: created.requestNumber,
        },
      });
    }

    return detailed ?? created;
  }

  /**
   * Fetches a request with tiers and comments, scoped to the company.
   * Includes categoryCode and sourceId (linked leave/overtime row) for typed UI.
   */
  async getRequest(requestId: string, companyId: string): Promise<unknown> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }

    const sourceId =
      request.leaveRequest?.id ?? request.overtimeRequest?.id ?? null;

    return {
      ...request,
      categoryCode: request.category?.code ?? null,
      sourceId,
      leaveRequest: undefined,
      overtimeRequest: undefined,
    };
  }

  /**
   * Lists requests with optional filters and pagination.
   * When `inbox` is set, scoping always uses the authenticated user id (never client-supplied ids).
   */
  async listRequests(
    filters: ListRequestsDto,
    companyId: string,
    userId?: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    let submittedById = filters.submittedById;
    let pendingApproverId = filters.pendingApproverId;

    if (filters.inbox === 'MY_REQUESTS' && userId) {
      submittedById = userId;
      pendingApproverId = undefined;
    } else if (filters.inbox === 'PENDING_MY_ACTION' && userId) {
      pendingApproverId = userId;
      submittedById = undefined;
    }

    const where: Prisma.ApprovalRequestWhereInput = activeOnly({
      companyId,
      ...(filters.status && filters.status.length > 0
        ? { status: { in: filters.status } }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(submittedById ? { requestedBy: submittedById } : {}),
      ...(pendingApproverId
        ? {
            tiers: {
              some: {
                approverId: pendingApproverId,
                decision: 'PENDING',
              },
            },
          }
        : {}),
      ...this.buildDateFilter(filters.dateFrom, filters.dateTo),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                title: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                requestNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { id: true, code: true, name: true, icon: true },
          },
          requester: { select: USER_SELECT },
          tiers: {
            select: {
              id: true,
              tierOrder: true,
              label: true,
              decision: true,
              approverId: true,
            },
            orderBy: { tierOrder: 'asc' },
          },
        },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  /**
   * Approves the active tier; advances or completes the request.
   * Unresolved conditions → CONDITIONALLY_APPROVED (no advance).
   */
  async approveTier(
    requestId: string,
    tierId: string,
    userId: string,
    note?: string,
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
    );
    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    const conditions = this.parseConditions(tier.conditions);
    const unresolved = conditions.filter((c) => !c.resolved);

    if (unresolved.length > 0) {
      await this.prisma.approvalTier.update({
        where: { id: tier.id },
        data: {
          decision: ApprovalTierDecision.CONDITIONALLY_APPROVED,
          comment: note ?? tier.comment,
          decidedAt: new Date(),
        },
      });
      return this.getRequest(request.id, request.companyId);
    }

    const nextApprover = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            decision: ApprovalTierDecision.APPROVED,
            comment: note ?? tier.comment,
            decidedAt: new Date(),
          },
        });
        return this.advanceAfterTierApproval(tx, request.id, userId);
      },
      PRISMA_TX_OPTIONS,
    );

    if (nextApprover) {
      await this.notifySafe(request.companyId, userId, {
        recipientId: nextApprover.approverId,
        eventType: APPROVAL_PENDING_EVENT,
        subject: `Approval required — ${request.requestNumber}`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approval-requests/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
      });
    } else {
      await this.dispatchFinalDecision(request.id, 'APPROVED');
    }

    return this.getRequest(request.id, request.companyId);
  }

  /**
   * Rejects the tier and the parent request.
   */
  async rejectTier(
    requestId: string,
    tierId: string,
    userId: string,
    note?: string,
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
    );
    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    const now = new Date();
    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            decision: ApprovalTierDecision.REJECTED,
            comment: note ?? null,
            decidedAt: now,
          },
        });
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: ApprovalRequestStatus.REJECTED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      },
      PRISMA_TX_OPTIONS,
    );

    await this.dispatchFinalDecision(request.id, 'REJECTED');

    return this.getRequest(request.id, request.companyId);
  }

  /**
   * Returns the request to the submitter; notifies them.
   */
  async returnTier(
    requestId: string,
    tierId: string,
    userId: string,
    note?: string,
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
    );
    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            decision: ApprovalTierDecision.RETURNED,
            comment: note ?? null,
            decidedAt: new Date(),
          },
        });
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: ApprovalRequestStatus.RETURNED,
            updatedBy: userId,
          },
        });
      },
      PRISMA_TX_OPTIONS,
    );

    await this.notifySafe(request.companyId, userId, {
      recipientId: request.requestedBy,
      eventType: APPROVAL_RETURNED_EVENT,
      subject: `Approval returned — ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Your approval request ${request.requestNumber} was returned for revision.`,
      link: `/approval-requests/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
    });

    await this.dispatchFinalDecision(request.id, 'RETURNED');

    return this.getRequest(request.id, request.companyId);
  }

  /**
   * Appends a condition to the tier conditions JSON.
   */
  async addCondition(
    requestId: string,
    tierId: string,
    text: string,
    userId: string,
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
    );
    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    const conditions = this.parseConditions(tier.conditions);
    conditions.push({
      text: text.trim(),
      resolved: false,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    });

    await this.prisma.approvalTier.update({
      where: { id: tier.id },
      data: {
        conditions: conditions as unknown as Prisma.InputJsonValue,
      },
    });

    return this.getRequest(request.id, request.companyId);
  }

  /**
   * Marks a condition resolved. When all resolved under CONDITIONALLY_APPROVED, advances.
   */
  async resolveCondition(
    requestId: string,
    tierId: string,
    conditionIndex: number,
    userId: string,
  ): Promise<unknown> {
    const tier = await this.prisma.approvalTier.findFirst({
      where: { id: tierId, requestId },
      include: {
        request: {
          select: {
            id: true,
            companyId: true,
            status: true,
            currentTier: true,
            requestedBy: true,
          },
        },
      },
    });
    if (!tier) {
      throw new NotFoundException('Approval tier not found');
    }

    const request = tier.request;
    const requestFull = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: request.id, companyId: request.companyId }),
      select: { id: true },
    });
    if (!requestFull) {
      throw new NotFoundException('Approval request not found');
    }

    const canResolve =
      userId === tier.approverId || userId === request.requestedBy;
    if (!canResolve) {
      throw new ForbiddenException(
        'Only the approver or submitter may resolve conditions',
      );
    }

    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    const conditions = this.parseConditions(tier.conditions);
    if (conditionIndex < 0 || conditionIndex >= conditions.length) {
      throw new BadRequestException('Invalid condition index');
    }

    conditions[conditionIndex] = {
      ...conditions[conditionIndex],
      resolved: true,
      resolvedBy: userId,
      resolvedAt: new Date().toISOString(),
    };

    const allResolved = conditions.every((c) => c.resolved);
    const shouldAdvance =
      allResolved &&
      tier.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED;

    const nextApprover = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            conditions: conditions as unknown as Prisma.InputJsonValue,
            ...(shouldAdvance
              ? {
                  decision: ApprovalTierDecision.APPROVED,
                  decidedAt: new Date(),
                }
              : {}),
          },
        });

        if (shouldAdvance) {
          return this.advanceAfterTierApproval(tx, request.id, userId);
        }
        return null;
      },
      PRISMA_TX_OPTIONS,
    );

    if (nextApprover) {
      await this.notifySafe(request.companyId, userId, {
        recipientId: nextApprover.approverId,
        eventType: APPROVAL_PENDING_EVENT,
        subject: `Approval required`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approval-requests/${request.id}`,
        variables: { requestId: request.id },
      });
    } else if (shouldAdvance) {
      await this.dispatchFinalDecision(request.id, 'APPROVED');
    }

    return this.getRequest(request.id, request.companyId);
  }

  /**
   * Notifies registered domain listeners (leave, overtime, …) of a terminal outcome.
   */
  private async dispatchFinalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    await this.decisionRegistry.notify(approvalRequestId, decision);
  }

  private buildDateFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.ApprovalRequestWhereInput {
    if (!dateFrom && !dateTo) {
      return {};
    }
    return {
      submittedAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    };
  }

  private async nextRequestNumber(prefix: string): Promise<string> {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('approval_request_number_seq') as nextval`);
    const next = Number(result[0]?.nextval ?? 1);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  private async loadTierForAction(
    requestId: string,
    tierId: string,
    userId: string,
  ): Promise<{
    tier: {
      id: string;
      tierOrder: number;
      approverId: string;
      decision: ApprovalTierDecision;
      comment: string | null;
      conditions: Prisma.JsonValue;
      decidedAt: Date | null;
    };
    request: {
      id: string;
      companyId: string;
      status: ApprovalRequestStatus;
      currentTier: number;
      requestedBy: string;
      requestNumber: string;
    };
  }> {
    const tier = await this.prisma.approvalTier.findFirst({
      where: { id: tierId, requestId },
      include: {
        request: {
          select: {
            id: true,
            companyId: true,
            status: true,
            currentTier: true,
            requestedBy: true,
            requestNumber: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!tier || tier.request.deletedAt) {
      throw new NotFoundException('Approval tier not found');
    }

    const scoped = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({
        id: tier.request.id,
        companyId: tier.request.companyId,
      }),
      select: { id: true },
    });
    if (!scoped) {
      throw new NotFoundException('Approval request not found');
    }

    if (tier.approverId !== userId) {
      throw new ForbiddenException(
        'Only the assigned approver can act on this tier',
      );
    }

    if (
      tier.decision !== ApprovalTierDecision.PENDING &&
      tier.decision !== ApprovalTierDecision.CONDITIONALLY_APPROVED
    ) {
      throw new BadRequestException(
        `Tier is already ${tier.decision} and cannot be actioned`,
      );
    }

    return {
      tier: {
        id: tier.id,
        tierOrder: tier.tierOrder,
        approverId: tier.approverId,
        decision: tier.decision,
        comment: tier.comment,
        conditions: tier.conditions,
        decidedAt: tier.decidedAt,
      },
      request: {
        id: tier.request.id,
        companyId: tier.request.companyId,
        status: tier.request.status,
        currentTier: tier.request.currentTier,
        requestedBy: tier.request.requestedBy,
        requestNumber: tier.request.requestNumber,
      },
    };
  }

  private assertPendingWorkflow(status: ApprovalRequestStatus): void {
    if (
      status !== ApprovalRequestStatus.PENDING &&
      status !== ApprovalRequestStatus.IN_REVIEW &&
      status !== ApprovalRequestStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        `Request status ${status} does not allow tier actions`,
      );
    }
  }

  private assertCurrentTier(currentTier: number, tierOrder: number): void {
    if (currentTier !== tierOrder) {
      throw new BadRequestException(
        `Tier ${tierOrder} is not the current active tier (${currentTier})`,
      );
    }
  }

  private parseConditions(raw: Prisma.JsonValue): TierCondition[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const result: TierCondition[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const record = item as Prisma.JsonObject;
      const text = String(record.text ?? '');
      if (!text) {
        continue;
      }
      const condition: TierCondition = {
        text,
        resolved: Boolean(record.resolved),
        createdBy: String(record.createdBy ?? ''),
        createdAt: String(record.createdAt ?? ''),
      };
      if (record.resolvedBy != null) {
        condition.resolvedBy = String(record.resolvedBy);
      }
      if (record.resolvedAt != null) {
        condition.resolvedAt = String(record.resolvedAt);
      }
      result.push(condition);
    }
    return result;
  }

  /**
   * After a tier is fully approved, advance to the next PENDING tier or complete.
   * Returns the next approver to notify, or null when the request is fully approved.
   */
  private async advanceAfterTierApproval(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorUserId: string,
  ): Promise<{ approverId: string; label: string } | null> {
    const tiers = await tx.approvalTier.findMany({
      where: { requestId },
      orderBy: { tierOrder: 'asc' },
    });

    const allSatisfied = tiers.every((t) => this.tierIsSatisfied(t));
    if (!allSatisfied) {
      const next = tiers.find(
        (t) => t.decision === ApprovalTierDecision.PENDING,
      );
      if (!next) {
        throw new BadRequestException(
          'Approval chain is incomplete and no pending tier remains',
        );
      }

      await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: ApprovalRequestStatus.PENDING,
          currentTier: next.tierOrder,
          updatedBy: actorUserId,
        },
      });

      return { approverId: next.approverId, label: next.label };
    }

    await tx.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        completedAt: new Date(),
        updatedBy: actorUserId,
      },
    });
    return null;
  }

  private tierIsSatisfied(tier: {
    decision: ApprovalTierDecision;
    conditions: Prisma.JsonValue;
  }): boolean {
    if (tier.decision === ApprovalTierDecision.APPROVED) {
      return true;
    }
    if (tier.decision === ApprovalTierDecision.SKIPPED) {
      return true;
    }
    if (tier.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED) {
      const conditions = this.parseConditions(tier.conditions);
      return conditions.length > 0 && conditions.every((c) => c.resolved);
    }
    return false;
  }

  private async notifySafe(
    companyId: string,
    userId: string,
    payload: {
      recipientId: string;
      eventType: string;
      subject: string;
      body: string;
      link?: string;
      variables?: Record<string, string>;
    },
  ): Promise<void> {
    try {
      await this.notificationService.send(
        { companyId, userId },
        {
          recipientId: payload.recipientId,
          eventType: payload.eventType,
          channel: 'IN_APP',
          subject: payload.subject,
          body: payload.body,
          link: payload.link,
          variables: payload.variables,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Approval notification failed (${payload.eventType})`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
