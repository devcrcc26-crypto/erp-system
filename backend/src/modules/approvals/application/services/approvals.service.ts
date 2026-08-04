import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  BusinessTripStatus,
  ExpenseClaimStatus,
  FlightAcknowledgementStatus,
  FlightApplicationStatus,
  FolderContextType,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
  PerDiemStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { LeaveBalanceService } from '../../../leave/application/services/leave-balance.service';
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
const APPROVAL_CONDITION_RESPONSE_EVENT = 'approval.condition_response';

export const RESPONSE_TYPE_RESUBMIT = 'RESUBMIT';
export const RESPONSE_TYPE_CONDITION = 'CONDITION_RESPONSE';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

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
  overtimeSheet: { select: { id: true } },
  flightApplication: { select: { id: true } },
  businessTrip: { select: { id: true } },
  expenseClaim: { select: { id: true } },
  perDiemRequest: { select: { id: true } },
  responses: {
    include: {
      responder: { select: USER_SELECT },
      documents: {
        include: {
          document: {
            select: {
              id: true,
              name: true,
              fileType: true,
              fileSizeBytes: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/** Interactive transaction options ? leave/overtime submit must not hit the 5s default. */
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
    private readonly permissionService: PermissionService,
    private readonly leaveBalanceService: LeaveBalanceService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
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
        subject: `Approval required ? ${created.requestNumber}`,
        body: `${dto.title} (${created.requestNumber}) is awaiting your approval.`,
        link: `/approvals/${created.id}`,
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
   * Access: hr.view / approvals.edit (full), requester, or any tier approver.
   */
  async getRequest(
    requestId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }

    await this.assertCanViewRequest(request, companyId, userId);

    const sourceId =
      request.businessTrip?.id ??
      request.flightApplication?.id ??
      request.leaveRequest?.id ??
      request.overtimeSheet?.id ??
      request.expenseClaim?.id ??
      request.perDiemRequest?.id ??
      null;

    return {
      ...request,
      categoryCode: request.category?.code ?? null,
      sourceId,
      leaveRequest: undefined,
      overtimeSheet: undefined,
      flightApplication: undefined,
      businessTrip: undefined,
      expenseClaim: undefined,
      perDiemRequest: undefined,
    };
  }

  /**
   * Lists requests with optional filters and pagination.
   * Full access (hr.view or approvals.edit): company-wide.
   * Otherwise: only requests the user submitted or is assigned to approve.
   * When `inbox` is set, scoping always uses the authenticated user id.
   */
  async listRequests(
    filters: ListRequestsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const isFullAccess = await this.hasApprovalsFullAccess(userId, companyId);

    let submittedById = isFullAccess ? filters.submittedById : undefined;
    let pendingApproverId = isFullAccess
      ? filters.pendingApproverId
      : undefined;

    if (filters.inbox === 'MY_REQUESTS') {
      submittedById = userId;
      pendingApproverId = undefined;
    } else if (filters.inbox === 'PENDING_MY_ACTION') {
      // Handled below with a broader OR (approver pending / conditional + requester action)
      pendingApproverId = undefined;
      submittedById = undefined;
    } else if (filters.inbox === 'ALL') {
      // Company-wide for full access only; non-full-access falls back to own requests
      submittedById = undefined;
      pendingApproverId = undefined;
      if (!isFullAccess) {
        submittedById = userId;
      }
    }

    const andClauses: Prisma.ApprovalRequestWhereInput[] = [];

    // PENDING_MY_ACTION uses its own OR scope (includes flight ticket ack); skip the
    // default "submitted or tier approver" gate so passengers can see ack items.
    if (!isFullAccess && filters.inbox !== 'PENDING_MY_ACTION') {
      andClauses.push({
        OR: [
          { requestedBy: userId },
          { tiers: { some: { approverId: userId } } },
        ],
      });
    }

    if (submittedById) {
      andClauses.push({ requestedBy: submittedById });
    }

    if (pendingApproverId) {
      andClauses.push({
        tiers: {
          some: {
            approverId: pendingApproverId,
            decision: ApprovalTierDecision.PENDING,
          },
        },
      });
    }

    let flightAckRequestIds = new Set<string>();
    let businessTripAckRequestIds = new Set<string>();

    if (filters.inbox === 'PENDING_MY_ACTION') {
      const flightsPendingAck = await this.prisma.flightPassenger.findMany({
        where: {
          employeeId: userId,
          acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
          AND: [
            {
              application: {
                companyId,
                deletedAt: null,
                status: FlightApplicationStatus.APPROVED,
                approvalRequestId: { not: null },
              },
            },
            {
              OR: [
                { ticketDocumentId: { not: null } },
                {
                  application: {
                    combinedTicketDocumentId: { not: null },
                  },
                },
              ],
            },
          ],
        },
        select: {
          application: {
            select: { approvalRequestId: true },
          },
        },
      });

      flightAckRequestIds = new Set(
        flightsPendingAck
          .map((row) => row.application?.approvalRequestId)
          .filter((id): id is string => Boolean(id)),
      );

      const tripsPendingAck = await this.prisma.businessTripPassenger.findMany({
        where: {
          employeeId: userId,
          acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
          AND: [
            {
              trip: {
                companyId,
                deletedAt: null,
                status: BusinessTripStatus.APPROVED,
                approvalRequestId: { not: null },
              },
            },
            {
              OR: [
                { ticketDocumentId: { not: null } },
                {
                  trip: {
                    combinedTicketDocumentId: { not: null },
                  },
                },
              ],
            },
          ],
        },
        select: {
          trip: {
            select: { approvalRequestId: true },
          },
        },
      });

      businessTripAckRequestIds = new Set(
        tripsPendingAck
          .map((row) => row.trip?.approvalRequestId)
          .filter((id): id is string => Boolean(id)),
      );

      const ticketAckIds = [
        ...flightAckRequestIds,
        ...businessTripAckRequestIds,
      ];

      andClauses.push({
        OR: [
          {
            tiers: {
              some: {
                approverId: userId,
                decision: {
                  in: [
                    ApprovalTierDecision.PENDING,
                    ApprovalTierDecision.CONDITIONALLY_APPROVED,
                  ],
                },
              },
            },
          },
          {
            requestedBy: userId,
            status: ApprovalRequestStatus.RETURNED,
          },
          {
            requestedBy: userId,
            tiers: {
              some: {
                decision: ApprovalTierDecision.CONDITIONALLY_APPROVED,
              },
            },
          },
          ...(ticketAckIds.length > 0
            ? [{ id: { in: ticketAckIds } }]
            : []),
        ],
      });
    }

    const search = filters.search?.trim();
    if (search) {
      andClauses.push({
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
          {
            requestNumber: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
        ],
      });
    }

    const where: Prisma.ApprovalRequestWhereInput = activeOnly({
      companyId,
      ...(filters.status && filters.status.length > 0
        ? { status: { in: filters.status } }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...this.buildDateFilter(filters.dateFrom, filters.dateTo),
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    });

    const listInclude = {
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
          conditions: true,
        },
        orderBy: { tierOrder: 'asc' as const },
      },
      responses: {
        select: {
          id: true,
          responseType: true,
          conditionIndex: true,
        },
      },
    } as const;

    if (filters.inbox === 'PENDING_MY_ACTION') {
      const candidates = await this.prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: listInclude,
      });

      const filtered = candidates.filter((row) =>
        this.requestNeedsUserAction(
          row,
          userId,
          flightAckRequestIds,
          businessTripAckRequestIds,
        ),
      );
      const total = filtered.length;
      const pageRows = filtered.slice(skip, skip + take).map((row) => ({
        ...row,
        categoryCode: row.category?.code ?? null,
        needsTicketAcknowledgement:
          flightAckRequestIds.has(row.id) ||
          businessTripAckRequestIds.has(row.id),
      }));

      return buildPaginatedResult(pageRows, total, page, limit);
    }

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
   * Returns the total number of approval requests matching the same filters as list.
   */
  async countRequests(
    filters: ListRequestsDto,
    companyId: string,
    userId: string,
  ): Promise<{ total: number }> {
    const page = await this.listRequests(
      { ...filters, page: 1, limit: 1 },
      companyId,
      userId,
    );
    return { total: page.meta.total };
  }

  /**
   * True when the user must act: approve/resolve as approver, resubmit/respond as
   * requester, or acknowledge a flight ticket as passenger.
   */
  private requestNeedsUserAction(
    row: {
      id?: string;
      requestedBy: string;
      status: ApprovalRequestStatus;
      currentTier: number;
      tiers: Array<{
        tierOrder: number;
        approverId: string;
        decision: ApprovalTierDecision;
        conditions: Prisma.JsonValue;
      }>;
      responses: Array<{
        responseType: string;
        conditionIndex: number | null;
      }>;
    },
    userId: string,
    flightAckRequestIds: Set<string> = new Set(),
    businessTripAckRequestIds: Set<string> = new Set(),
  ): boolean {
    if (row.id && flightAckRequestIds.has(row.id)) {
      return true;
    }
    if (row.id && businessTripAckRequestIds.has(row.id)) {
      return true;
    }

    const current = row.tiers.find((t) => t.tierOrder === row.currentTier);

    if (current && current.approverId === userId) {
      if (current.decision === ApprovalTierDecision.PENDING) {
        return true;
      }
      if (current.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED) {
        const conditions = this.parseConditions(current.conditions);
        // Approver: show when at least one unresolved condition has an employee response
        return conditions.some(
          (condition, index) =>
            !condition.resolved &&
            row.responses.some(
              (r) =>
                r.responseType === RESPONSE_TYPE_CONDITION &&
                r.conditionIndex === index,
            ),
        );
      }
    }

    if (row.requestedBy === userId) {
      if (row.status === ApprovalRequestStatus.RETURNED) {
        return true;
      }
      if (current?.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED) {
        const conditions = this.parseConditions(current.conditions);
        // Requester: show while any unresolved condition lacks a response
        return conditions.some(
          (condition, index) =>
            !condition.resolved &&
            !row.responses.some(
              (r) =>
                r.responseType === RESPONSE_TYPE_CONDITION &&
                r.conditionIndex === index,
            ),
        );
      }
    }

    return false;
  }

  /**
   * Approves the active tier; advances or completes the request.
   * Unresolved conditions ? CONDITIONALLY_APPROVED (no advance).
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

    // Already conditionally approved: must resolve all conditions before approving
    if (
      unresolved.length > 0 &&
      tier.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED
    ) {
      throw new BadRequestException(
        'All conditions must be resolved before taking action on this tier',
      );
    }

    if (unresolved.length > 0) {
      await this.prisma.approvalTier.update({
        where: { id: tier.id },
        data: {
          decision: ApprovalTierDecision.CONDITIONALLY_APPROVED,
          comment: note ?? tier.comment,
          decidedAt: new Date(),
        },
      });
      return this.getRequest(request.id, request.companyId, userId);
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
        subject: `Approval required ? ${request.requestNumber}`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approvals/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
      });
    } else {
      await this.dispatchFinalDecision(request.id, 'APPROVED');
    }

    return this.getRequest(request.id, request.companyId, userId);
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

    const unresolvedReject = this.parseConditions(tier.conditions).filter(
      (c) => !c.resolved,
    );
    if (unresolvedReject.length > 0) {
      throw new BadRequestException(
        'All conditions must be resolved before taking action on this tier',
      );
    }

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

    return this.getRequest(request.id, request.companyId, userId);
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

    const unresolvedReturn = this.parseConditions(tier.conditions).filter(
      (c) => !c.resolved,
    );
    if (unresolvedReturn.length > 0) {
      throw new BadRequestException(
        'All conditions must be resolved before taking action on this tier',
      );
    }

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
      subject: `Approval returned ? ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Your approval request ${request.requestNumber} was returned for revision.`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
    });

    await this.dispatchFinalDecision(request.id, 'RETURNED');

    return this.getRequest(request.id, request.companyId, userId);
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
    const unresolved = conditions.filter((c) => !c.resolved);
    if (unresolved.length > 0) {
      throw new BadRequestException(
        'Existing conditions must be resolved before adding new ones',
      );
    }

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

    return this.getRequest(request.id, request.companyId, userId);
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

    if (userId !== tier.approverId) {
      throw new ForbiddenException(
        'Only the assigned approver may resolve conditions',
      );
    }

    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);

    const conditions = this.parseConditions(tier.conditions);
    if (conditionIndex < 0 || conditionIndex >= conditions.length) {
      throw new BadRequestException('Invalid condition index');
    }

    const hasResponse = await this.prisma.approvalResponse.findFirst({
      where: {
        requestId,
        responseType: RESPONSE_TYPE_CONDITION,
        conditionIndex,
      },
    });
    if (!hasResponse) {
      throw new BadRequestException(
        'Employee must respond to this condition before it can be resolved',
      );
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
        link: `/approvals/${request.id}`,
        variables: { requestId: request.id },
      });
    } else if (shouldAdvance) {
      await this.dispatchFinalDecision(request.id, 'APPROVED');
    }

    return this.getRequest(request.id, request.companyId, userId);
  }

  /**
   * Requester resubmits a RETURNED request: records response, resets tiers, notifies tier 1.
   */
  async resubmitRequest(
    requestId: string,
    companyId: string,
    userId: string,
    note: string | undefined,
    files: UploadedFile[],
  ): Promise<unknown> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: {
        tiers: { orderBy: { tierOrder: 'asc' } },
        leaveRequest: true,
        overtimeSheet: true,
        flightApplication: true,
        businessTrip: true,
        expenseClaim: true,
        perDiemRequest: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.requestedBy !== userId) {
      throw new ForbiddenException('Only the requester can resubmit');
    }
    if (request.status !== ApprovalRequestStatus.RETURNED) {
      throw new BadRequestException(
        'Only returned requests can be resubmitted',
      );
    }

    const responseId = randomUUID();
    const firstTier = request.tiers[0];
    if (!firstTier) {
      throw new BadRequestException('Approval chain has no tiers');
    }

    const folderId = await this.ensureApprovalAttachmentFolder(
      request,
      userId,
    );
    const documentIds = await this.uploadResponseFiles({
      companyId,
      requestId: request.id,
      responseId,
      folderId,
      userId,
      files,
    });

    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalResponse.create({
          data: {
            id: responseId,
            requestId: request.id,
            responseType: RESPONSE_TYPE_RESUBMIT,
            note: note?.trim() || null,
            respondedBy: userId,
            documents: {
              create: documentIds.map((documentId) => ({
                id: randomUUID(),
                documentId,
              })),
            },
          },
        });

        for (const tier of request.tiers) {
          await tx.approvalTier.update({
            where: { id: tier.id },
            data: {
              decision: ApprovalTierDecision.PENDING,
              comment: null,
              decidedAt: null,
              conditions: [],
            },
          });
        }

        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: ApprovalRequestStatus.SUBMITTED,
            currentTier: firstTier.tierOrder,
            completedAt: null,
            updatedBy: userId,
          },
        });

        if (request.leaveRequest) {
          await tx.leaveRequest.update({
            where: { id: request.leaveRequest.id },
            data: {
              status: LeaveRequestStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.overtimeSheet) {
          await tx.overtimeSheet.update({
            where: { id: request.overtimeSheet.id },
            data: {
              status: OvertimeSheetStatus.SUBMITTED,
              completedAt: null,
              submittedAt: new Date(),
              updatedBy: userId,
            },
          });
        }

        if (request.flightApplication) {
          await tx.flightApplication.update({
            where: { id: request.flightApplication.id },
            data: {
              status: FlightApplicationStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.businessTrip) {
          await tx.businessTrip.update({
            where: { id: request.businessTrip.id },
            data: {
              status: BusinessTripStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.expenseClaim) {
          await tx.expenseClaim.update({
            where: { id: request.expenseClaim.id },
            data: {
              status: ExpenseClaimStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.perDiemRequest) {
          await tx.perDiemRequest.update({
            where: { id: request.perDiemRequest.id },
            data: {
              status: PerDiemStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }
      },
      PRISMA_TX_OPTIONS,
    );

    if (
      request.leaveRequest &&
      request.leaveRequest.leaveType !== LeaveType.UNPAID
    ) {
      const year = request.leaveRequest.startDate.getUTCFullYear();
      await this.leaveBalanceService.adjustBalance(
        request.leaveRequest.employeeId,
        request.leaveRequest.leaveType,
        year,
        'pending',
        Number(request.leaveRequest.days),
        companyId,
      );
    }

    await this.notifySafe(companyId, userId, {
      recipientId: firstTier.approverId,
      eventType: APPROVAL_PENDING_EVENT,
      subject: `Resubmitted for approval — ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Request ${request.requestNumber} was resubmitted and awaits your review.`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
    });

    return this.getRequest(request.id, companyId, userId);
  }

  /**
   * Requester responds to a condition on a CONDITIONALLY_APPROVED tier.
   */
  async respondToCondition(
    requestId: string,
    conditionIndex: number,
    companyId: string,
    userId: string,
    note: string | undefined,
    files: UploadedFile[],
  ): Promise<unknown> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: {
        tiers: { orderBy: { tierOrder: 'asc' } },
      },
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.requestedBy !== userId) {
      throw new ForbiddenException(
        'Only the requester can respond to conditions',
      );
    }

    this.assertPendingWorkflow(request.status);

    const activeTier = request.tiers.find(
      (t) => t.tierOrder === request.currentTier,
    );
    if (!activeTier) {
      throw new BadRequestException('No active approval tier');
    }
    if (activeTier.decision !== ApprovalTierDecision.CONDITIONALLY_APPROVED) {
      throw new BadRequestException(
        'Active tier is not conditionally approved',
      );
    }

    const conditions = this.parseConditions(activeTier.conditions);
    if (conditionIndex < 0 || conditionIndex >= conditions.length) {
      throw new BadRequestException('Invalid condition index');
    }
    if (conditions[conditionIndex].resolved) {
      throw new BadRequestException('Condition is already resolved');
    }

    const responseId = randomUUID();
    const folderId = await this.ensureApprovalAttachmentFolder(
      request,
      userId,
    );
    const documentIds = await this.uploadResponseFiles({
      companyId,
      requestId: request.id,
      responseId,
      folderId,
      userId,
      files,
    });

    await this.prisma.approvalResponse.create({
      data: {
        id: responseId,
        requestId: request.id,
        responseType: RESPONSE_TYPE_CONDITION,
        conditionIndex,
        note: note?.trim() || null,
        respondedBy: userId,
        documents: {
          create: documentIds.map((documentId) => ({
            id: randomUUID(),
            documentId,
          })),
        },
      },
    });

    await this.notifySafe(companyId, userId, {
      recipientId: activeTier.approverId,
      eventType: APPROVAL_CONDITION_RESPONSE_EVENT,
      subject: `Condition response — ${request.requestNumber}`,
      body:
        note?.trim() ||
        `The requester responded to a condition on ${request.requestNumber}.`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
        conditionIndex: String(conditionIndex),
      },
    });

    return this.getRequest(request.id, companyId, userId);
  }

  /**
   * Ensures an attachment folder exists for the approval request.
   */
  private async ensureApprovalAttachmentFolder(
    request: {
      id: string;
      companyId: string;
      requestNumber: string;
      attachmentFolderId: string | null;
    },
    userId: string,
  ): Promise<string> {
    if (request.attachmentFolderId) {
      return request.attachmentFolderId;
    }

    const folderId = randomUUID();
    const path = `/approvals/${request.requestNumber}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId: request.companyId,
          name: `Approval ${request.requestNumber}`,
          path,
          contextType: FolderContextType.APPROVAL,
          contextId: request.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          attachmentFolderId: folderId,
          updatedBy: userId,
        },
      });
    });

    return folderId;
  }

  /**
   * Uploads response files to erp-hr and creates Document + DocumentVersion rows.
   */
  private async uploadResponseFiles(input: {
    companyId: string;
    requestId: string;
    responseId: string;
    folderId: string;
    userId: string;
    files: UploadedFile[];
  }): Promise<string[]> {
    const documentIds: string[] = [];

    for (const file of input.files ?? []) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type not allowed: ${file.mimetype}`,
        );
      }

      const documentId = randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${input.companyId}/approvals/${input.requestId}/responses/${input.responseId}/${safeName}`;

      await this.storage.upload({
        bucket: STORAGE_BUCKETS.HR,
        key: fileKey,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.document.create({
          data: {
            id: documentId,
            companyId: input.companyId,
            folderId: input.folderId,
            name: file.originalname,
            fileKey,
            fileType: file.mimetype,
            fileSizeBytes: file.size,
            version: 1,
            isCurrent: true,
            createdBy: input.userId,
            updatedBy: input.userId,
          },
        });
        await tx.documentVersion.create({
          data: {
            documentId,
            uploadedBy: input.userId,
            versionNumber: 1,
            fileKey,
            fileSizeBytes: file.size,
          },
        });
      });

      documentIds.push(documentId);
    }

    return documentIds;
  }

  /**
   * Notifies registered domain listeners (leave, overtime, ?) of a terminal outcome.
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

  /**
   * Full company-wide visibility: hr.view (GM/MD/HR/Admin) or approvals.edit (admin).
   */
  private async hasApprovalsFullAccess(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const [hrView, approvalsAdmin] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.permissionService.hasPermission(
        userId,
        companyId,
        'approvals',
        'edit',
      ),
    ]);
    return hrView || approvalsAdmin;
  }

  /**
   * Ensures the caller may view this approval request.
   */
  private async assertCanViewRequest(
    request: {
      id: string;
      requestedBy: string;
      tiers: Array<{ approverId: string }>;
      flightApplication?: { id: string } | null;
      businessTrip?: { id: string } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isFullAccess = await this.hasApprovalsFullAccess(userId, companyId);
    if (isFullAccess) {
      return;
    }

    const isRequester = request.requestedBy === userId;
    const isApprover = request.tiers.some((t) => t.approverId === userId);
    if (isRequester || isApprover) {
      return;
    }

    if (request.flightApplication?.id) {
      const passenger = await this.prisma.flightPassenger.findFirst({
        where: {
          applicationId: request.flightApplication.id,
          employeeId: userId,
        },
        select: { id: true },
      });
      if (passenger) {
        return;
      }
    }

    if (request.businessTrip?.id) {
      const passenger = await this.prisma.businessTripPassenger.findFirst({
        where: {
          tripId: request.businessTrip.id,
          employeeId: userId,
        },
        select: { id: true },
      });
      if (passenger) {
        return;
      }
    }

    throw new ForbiddenException(
      'You do not have access to this approval request',
    );
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
