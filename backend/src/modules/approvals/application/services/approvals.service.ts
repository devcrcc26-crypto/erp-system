import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
  NotificationChannel,
  NotificationStatus,
  OvertimeSheetStatus,
  PerDiemStatus,
  Prisma,
  PurchaseRequestStatus,
  RequestInitiatorType,
  MaterialRequisitionStatus,
  ConsumablesRequisitionStatus,
  VehicleApplicationStatus,
  VehicleRefuelingStatus,
  SealStatus,
  ExitPermitStatus,
  SiteAssignmentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { AuditService } from '../../../audit/application/services/audit.service';
import { HR_OR_FULL_ACCESS_ROLES } from '../../../hr-shared/application/services/hr-approval-chain.service';
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
import { markPayrollAttendanceSnapshotStale } from '../../../attendance/application/utils/attendance-recalc-policy.util';
import {
  lateSubmissionMetaFromApprovalRequest,
  payrollMonthsFromApprovalRequest,
} from '../../../hr-shared/application/utils/late-submission-meta.util';
import { resolveCategoryPermissionModule } from '../utils/approval-category-permission.util';
import { PURCHASE_REQUEST_SUBMITTER_ROLES } from '../../../purchase-request/application/purchase-request-submitter.roles';
import { getPolicy } from '../../../../shared/policy/policy-reader.util';
import type {
  InitiatorRequestType,
  RequestInitiator,
} from '../../../../shared/policy/policy-definitions';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import {
  AUTO_APPROVE_COMMENT,
  AUTO_APPROVE_FALLBACK_TIER_LABEL,
  getAutoApproveModeFromEnv,
  isAutoApproveExcludedCategory,
} from '../../../../shared/config/auto-approve.mode';
import { ApprovalDecisionRegistry } from './approval-decision-registry.service';
import { isOnBehalfCreator } from '../utils/on-behalf-approval.util';
import {
  ApprovalResolverService,
  type MatchedApprovalRule,
  type ResolvedApprovalTier,
} from './approval-resolver.service';

const APPROVAL_RETURNED_EVENT = 'approval.returned';
const APPROVAL_PENDING_EVENT = 'approval.pending';
const APPROVAL_CONDITION_RESPONSE_EVENT = 'approval.condition_response';
const APPROVAL_APPROVED_EVENT = 'approval.approved';
const APPROVAL_REJECTED_EVENT = 'approval.rejected';
const APPROVAL_APPROVED_ON_BEHALF_EVENT = 'approval.approved_on_behalf';
const APPROVAL_RETURNED_ON_BEHALF_EVENT = 'approval.returned_on_behalf';

export const APPROVE_ON_BEHALF_ROLE_MESSAGE =
  'Only the General Manager, Managing Director, HR Manager, HR Officer or System Administrator can approve or return on behalf of another approver';
export const APPROVE_ON_BEHALF_OWN_SUBMISSION_MESSAGE =
  "You can't approve or return on behalf of another approver on a request you submitted or filed for someone.";
export const APPROVE_ON_BEHALF_OWN_REQUEST_MESSAGE =
  "You can't approve or return on behalf of another approver on your own request.";

export const RESPONSE_TYPE_RESUBMIT = 'RESUBMIT';
export const RESPONSE_TYPE_CONDITION = 'CONDITION_RESPONSE';
export const RESPONSE_TYPE_RETURNED = 'RETURNED';
export const RESPONSE_TYPE_CANCELLED = 'CANCELLED';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const USER_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
} as const;

const REQUEST_DETAIL_INCLUDE = {
  category: true,
  requester: { select: USER_SELECT },
  creator: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
  tiers: {
    include: {
      approver: { select: USER_SELECT },
      actingApprover: { select: USER_SELECT },
      onBehalfOfApprover: { select: USER_SELECT },
    },
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
  perDiemSettlement: { select: { id: true } },
  purchaseRequest: { select: { id: true } },
  materialRequisition: { select: { id: true } },
  consumablesRequisition: { select: { id: true } },
  vehicleApplication: { select: { id: true } },
  vehicleRefueling: { select: { id: true } },
  officialSeal: { select: { id: true } },
  projectSeal: { select: { id: true } },
  exitPermit: { select: { id: true } },
  siteAssignment: { select: { id: true } },
  fieldMovementLog: {
    select: {
      id: true,
      employeeId: true,
      createdBy: true,
      creator: { select: { id: true, firstName: true, middleName: true, lastName: true } },
    },
  },
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

/** Who-may-file facts for the New Request category list. */
interface FilingContext {
  takesPartInHrProcesses: boolean;
  hasDirectReports: boolean;
  hrView: boolean;
  siteManage: boolean;
  primaryRoleName: string;
  initiators: Record<InitiatorRequestType, RequestInitiator[]>;
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
    @Optional()
    private readonly audit?: AuditService,
  ) {}

  /**
   * Lists active, user-requestable approval categories the caller may create.
   * System Administrator sees every requestable category. Per Diem Settlement
   * is further gated on having at least one paid, unsettled advance (admins exempt).
   */
  async getCategories(companyId: string, userId: string): Promise<unknown[]> {
    const categories = await this.prisma.approvalCategory.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        isUserRequestable: true,
      }),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const roleNames = await this.permissionService.getUserRoleNames(
      userId,
      companyId,
    );
    const isSysAdmin = isTrueSystemAdministrator(roleNames);

    // Use the code→module map (column may exist before Prisma client is regenerated).
    const modules = [
      ...new Set(
        categories
          .map((category) => resolveCategoryPermissionModule(category.code))
          .filter((module): module is string => Boolean(module)),
      ),
    ];
    const permissionMap = isSysAdmin
      ? null
      : await this.permissionService.getUserModulePermissionsMap(
          userId,
          companyId,
          modules,
        );

    let hasPaidUnsettledAdvance = isSysAdmin;
    if (!isSysAdmin) {
      const needsSettlementGate = categories.some(
        (category) => category.code === 'PER_DIEM_SETTLEMENT',
      );
      if (needsSettlementGate) {
        const count = await this.prisma.perDiemRequest.count({
          where: activeOnly({
            companyId,
            employeeId: userId,
            status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
            settlementId: null,
            disbursements: { some: {} },
          }),
        });
        hasPaidUnsettledAdvance = count > 0;
      }
    }

    const permitted = categories.filter((category) => {
      if (category.code === 'PER_DIEM_SETTLEMENT' && !hasPaidUnsettledAdvance) {
        return false;
      }
      if (isSysAdmin) {
        return true;
      }
      const module = resolveCategoryPermissionModule(category.code);
      if (!module) {
        return false;
      }
      return permissionMap?.[module]?.canCreate === true;
    });
    if (isSysAdmin) {
      return permitted;
    }

    // Every role holds `create` on the New Request modules, so also apply the
    // submit-time rules: hide what this user would be refused on submit.
    const filing = await this.loadFilingContext(companyId, userId);
    return permitted.filter((category) =>
      this.canFileCategory(category.code, filing),
    );
  }

  /** Facts the submit services check about who may file a request. */
  private async loadFilingContext(
    companyId: string,
    userId: string,
  ): Promise<FilingContext> {
    const [user, directReports, hrView, siteManage, primaryRole, initiators] =
      await Promise.all([
        this.prisma.user.findFirst({
          where: activeOnly({ id: userId, companyId }),
          select: { excludedFromHrProcesses: true },
        }),
        this.prisma.user.count({
          where: activeOnly({ companyId, reportsToUserId: userId, isActive: true }),
        }),
        this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
        this.permissionService.hasPermission(
          userId,
          companyId,
          'site-assignment',
          'manage',
        ),
        this.prisma.userRole.findFirst({
          where: activeOnly({
            userId,
            isPrimary: true,
            role: activeOnly({ companyId }),
          }),
          select: { role: { select: { name: true } } },
        }),
        getPolicy(this.prisma, companyId, 'allowedInitiators', new Date()),
      ]);
    return {
      takesPartInHrProcesses: user?.excludedFromHrProcesses !== true,
      hasDirectReports: directReports > 0,
      hrView,
      siteManage,
      primaryRoleName: primaryRole?.role.name ?? '',
      initiators,
    };
  }

  /**
   * Mirrors the submit-time rules (purchase-request roles, site-assignment
   * submitters, allowed initiators) so New Request only lists what will work.
   */
  private canFileCategory(code: string, filing: FilingContext): boolean {
    switch (code) {
      case 'PURCHASE_REQUEST':
        return PURCHASE_REQUEST_SUBMITTER_ROLES.includes(filing.primaryRoleName);
      case 'SITE_ASSIGNMENT':
        // Never for yourself: HR, or a supervisor for their direct reports.
        return filing.hrView || filing.siteManage || filing.hasDirectReports;
      case 'WORK_FROM_HOME':
      case 'FLIGHT_APPLICATION':
      case 'BUSINESS_TRIP': {
        const allowed = filing.initiators[code as InitiatorRequestType];
        const self =
          allowed.includes('SELF') &&
          (code !== 'WORK_FROM_HOME' || filing.takesPartInHrProcesses);
        const supervisor =
          allowed.includes('SUPERVISOR') && filing.hasDirectReports;
        const delegate = allowed.includes('DELEGATE') && filing.hrView;
        return self || supervisor || delegate;
      }
      default:
        return true;
    }
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
    options?: {
      resolvedTiers?: MatchedApprovalRule;
      /** On-behalf filings: the person who filed it (defaults to `userId`). */
      createdByUserId?: string;
      /**
       * Capacity the creator filed in. Defaults to SELF when creator = subject,
       * otherwise DELEGATE (every other on-behalf path is delegate-scoped).
       */
      initiatedAs?: RequestInitiatorType;
      lateSubmission?: {
        isLateSubmission: boolean;
        lateReason: string | null;
      };
    },
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
    if (!category.isUserRequestable) {
      throw new BadRequestException(
        `Approval category "${dto.categoryCode}" cannot be submitted from New Request`,
      );
    }

    // On-behalf filings pass the subject as `userId` (requestedBy) and the
    // filer as `createdByUserId`. Create permission belongs to the filer.
    const actorUserId = options?.createdByUserId ?? userId;
    const permissionModule = resolveCategoryPermissionModule(category.code);
    if (permissionModule) {
      const roleNames = await this.permissionService.getUserRoleNames(
        actorUserId,
        companyId,
      );
      if (!isTrueSystemAdministrator(roleNames)) {
        const canCreate = await this.permissionService.hasPermission(
          actorUserId,
          companyId,
          permissionModule,
          'create',
        );
        if (!canCreate) {
          throw new ForbiddenException(
            `Missing permission: ${permissionModule}.create`,
          );
        }
      }
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

    let matched: MatchedApprovalRule =
      options?.resolvedTiers ??
      (await this.resolveRuleWithAutoApproveFallback(
        companyId,
        userId,
        category.approvalRules,
        dto.formData,
      ));

    if (!matched.tiers || matched.tiers.length === 0) {
      const mode = getAutoApproveModeFromEnv();
      if (mode.active && !isAutoApproveExcludedCategory(category.code)) {
        matched = {
          ruleName: AUTO_APPROVE_FALLBACK_TIER_LABEL,
          tiers: [this.buildAutoApproveFallbackTier(mode.actorId)],
        };
      } else {
        throw new BadRequestException('Approval chain has no tiers');
      }
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
            isLateSubmission:
              options?.lateSubmission?.isLateSubmission === true,
            lateReason: options?.lateSubmission?.lateReason ?? null,
            initiatedAs:
              (options?.createdByUserId ?? userId) === userId
                ? RequestInitiatorType.SELF
                : (options?.initiatedAs ?? RequestInitiatorType.DELEGATE),
            createdBy: options?.createdByUserId ?? userId,
            updatedBy: options?.createdByUserId ?? userId,
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

    const firstTier = matched.tiers[0];
    if (firstTier?.approverId) {
      await this.notifyApprovalPending(companyId, userId, firstTier, {
        subject: `Approval required - ${created.requestNumber}`,
        body: `${dto.title} (${created.requestNumber}) is awaiting your approval.`,
        link: `/approvals/${created.id}`,
        variables: {
          requestId: created.id,
          requestNumber: created.requestNumber,
        },
        excludeRecipientIds: [userId, options?.createdByUserId].filter(
          (id): id is string => Boolean(id),
        ),
      });
    }

    this.enqueueAutoApproveAll(created.id, companyId, category.code);

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
      request.perDiemSettlement?.id ??
      request.purchaseRequest?.id ??
      request.materialRequisition?.id ??
      request.consumablesRequisition?.id ??
      request.vehicleApplication?.id ??
      request.vehicleRefueling?.id ??
      request.officialSeal?.id ??
      request.projectSeal?.id ??
      request.exitPermit?.id ??
      request.siteAssignment?.id ??
      request.fieldMovementLog?.id ??
      null; 

    // Field movement filed on someone's behalf: who filed it, and whether the
    // viewer is that person (banner only; assigned approvers may still approve).
    const fieldMovement = request.fieldMovementLog;
    let onBehalf: {
      submittedBy: { id: string; name: string };
      viewerIsSubmitter: boolean;
    } | null =
      fieldMovement && fieldMovement.createdBy !== fieldMovement.employeeId
        ? {
            submittedBy: {
              id: fieldMovement.creator.id,
              name: [
                fieldMovement.creator.firstName,
                fieldMovement.creator.middleName,
                fieldMovement.creator.lastName,
              ]
                .filter((part) => Boolean(part && part.trim()))
                .join(' '),
            },
            viewerIsSubmitter: isOnBehalfCreator(fieldMovement, userId),
          }
        : null;

    if (
      !onBehalf &&
      request.createdBy !== request.requestedBy &&
      request.creator
    ) {
      onBehalf = {
        submittedBy: {
          id: request.creator.id,
          name: [
            request.creator.firstName,
            request.creator.middleName,
            request.creator.lastName,
          ]
            .filter((part) => Boolean(part && part.trim()))
            .join(' '),
        },
        viewerIsSubmitter: request.createdBy === userId,
      };
    }

    const lateSubmission = lateSubmissionMetaFromApprovalRequest({
      isLateSubmission: request.isLateSubmission,
      lateReason: request.lateReason,
      categoryCode: request.category?.code ?? null,
      formData: request.formData,
    });

    const currentTier = request.tiers.find(
      (tier) =>
        tier.tierOrder === request.currentTier &&
        (tier.decision === ApprovalTierDecision.PENDING ||
          tier.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED),
    );
    // Full-access roles may approve the current tier for its assigned approver,
    // never on a request they filed or are the subject of.
    const canApproveOnBehalf =
      Boolean(currentTier) &&
      currentTier!.approverId !== userId &&
      request.createdBy !== userId &&
      request.requestedBy !== userId &&
      [
        ApprovalRequestStatus.PENDING,
        ApprovalRequestStatus.IN_REVIEW,
        ApprovalRequestStatus.SUBMITTED,
      ].includes(request.status as 'PENDING') &&
      (await this.isFullAccessApprover(userId, companyId));

    return {
      ...request,
      categoryCode: request.category?.code ?? null,
      sourceId,
      onBehalf,
      canApproveOnBehalf,
      lateSubmission,
      leaveRequest: undefined,
      overtimeSheet: undefined,
      flightApplication: undefined,
      businessTrip: undefined,
      expenseClaim: undefined,
      perDiemRequest: undefined,
      perDiemSettlement: undefined,
      purchaseRequest: undefined,
      materialRequisition: undefined,
      consumablesRequisition: undefined,
      vehicleApplication: undefined,
      vehicleRefueling: undefined,
      officialSeal: undefined,
      projectSeal: undefined,
      exitPermit: undefined,
      siteAssignment: undefined,
      fieldMovementLog: undefined,
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
    // Cancelled requests are hidden from the approval chain: approvers no
    // longer see them; the requester keeps them in their history.
    if (!isFullAccess && filters.inbox !== 'PENDING_MY_ACTION') {
      andClauses.push({
        OR: [
          { requestedBy: userId },
          {
            tiers: { some: { approverId: userId } },
            status: { not: ApprovalRequestStatus.CANCELLED },
          },
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
        status: { not: ApprovalRequestStatus.CANCELLED },
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

      const hrManagerIds = await this.findActiveHrManagerUserIds(companyId);
      const isHrManagerViewer = hrManagerIds.includes(userId);

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
          ...(isHrManagerViewer
            ? [
                {
                  tiers: {
                    some: {
                      decision: {
                        in: [
                          ApprovalTierDecision.PENDING,
                          ApprovalTierDecision.CONDITIONALLY_APPROVED,
                        ],
                      },
                      OR: [
                        {
                          label: {
                            in: [
                              'HR Manager',
                              'Local HR Manager',
                              'HR Officer',
                            ],
                          },
                        },
                        {
                          resolver: {
                            in: [
                              'ROLE:HR Manager',
                              'ROLE:Local HR Manager',
                              'ROLE:HR Officer',
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ]
            : []),
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
      // Nothing to act on once cancelled (tier decisions are left as-is).
      andClauses.push({ status: { not: ApprovalRequestStatus.CANCELLED } });
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
      creator: { select: USER_SELECT },
      tiers: {
        select: {
          id: true,
          tierOrder: true,
          label: true,
          resolver: true,
          decision: true,
          approverId: true,
          conditions: true,
          actingApprover: { select: USER_SELECT },
          onBehalfOfApprover: { select: USER_SELECT },
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
      const hrManagerPeerIds = new Set(
        await this.findActiveHrManagerUserIds(companyId),
      );

      const filtered = candidates.filter((row) =>
        this.requestNeedsUserAction(
          row,
          userId,
          flightAckRequestIds,
          businessTripAckRequestIds,
          hrManagerPeerIds,
        ),
      );
      const total = filtered.length;
      const pageRows = filtered.slice(skip, skip + take).map((row) => ({
        ...row,
        categoryCode: row.category?.code ?? null,
        lateSubmission: lateSubmissionMetaFromApprovalRequest({
          isLateSubmission: row.isLateSubmission,
          lateReason: row.lateReason,
          categoryCode: row.category?.code ?? null,
          formData: row.formData,
        }),
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
          creator: { select: USER_SELECT },
          tiers: {
            select: {
              id: true,
              tierOrder: true,
              label: true,
              decision: true,
              approverId: true,
              actingApprover: { select: USER_SELECT },
              onBehalfOfApprover: { select: USER_SELECT },
            },
            orderBy: { tierOrder: 'asc' },
          },
        },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        ...row,
        categoryCode: row.category?.code ?? null,
        lateSubmission: lateSubmissionMetaFromApprovalRequest({
          isLateSubmission: row.isLateSubmission,
          lateReason: row.lateReason,
          categoryCode: row.category?.code ?? null,
          formData: row.formData,
        }),
      })),
      total,
      page,
      limit,
    );
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
        label?: string | null;
        resolver?: string | null;
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
    hrManagerPeerIds: Set<string> = new Set(),
  ): boolean {
    if (row.id && flightAckRequestIds.has(row.id)) {
      return true;
    }
    if (row.id && businessTripAckRequestIds.has(row.id)) {
      return true;
    }

    const current = row.tiers.find((t) => t.tierOrder === row.currentTier);

    const isAssignedApprover = Boolean(
      current && current.approverId === userId,
    );
    const isHrManagerPeer =
      Boolean(current) &&
      hrManagerPeerIds.has(userId) &&
      this.isHrManagerApprovalTier(current!) &&
      hrManagerPeerIds.has(current!.approverId);

    if (current && (isAssignedApprover || isHrManagerPeer)) {
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
    options?: {
      bypassApproverCheck?: boolean;
      /** Full-access roles approve the current tier for its assigned approver. */
      onBehalf?: boolean;
    },
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
      {
        bypassApproverCheck:
          options?.bypassApproverCheck === true || options?.onBehalf === true,
      },
    );
    const hrManagerPeer =
      tier.approverId !== userId &&
      (await this.canActAsHrManagerPeer(request.companyId, userId, tier));
    const actingOnBehalf =
      options?.bypassApproverCheck !== true &&
      tier.approverId !== userId &&
      !hrManagerPeer &&
      options?.onBehalf === true;
    if (actingOnBehalf) {
      await this.assertCanApproveOnBehalf(request, userId);
    }
    this.assertPendingWorkflow(request.status);
    this.assertCurrentTier(request.currentTier, tier.tierOrder);
    const onBehalfData = actingOnBehalf
      ? { actingApproverId: userId, onBehalfOfApproverId: tier.approverId }
      : {};

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
          ...onBehalfData,
        },
      });
      if (actingOnBehalf) {
        await this.afterActedOnBehalf('approve', request, tier, userId);
      }
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
            ...onBehalfData,
          },
        });
        return this.advanceAfterTierApproval(tx, request.id, userId);
      },
      PRISMA_TX_OPTIONS,
    );
    if (actingOnBehalf) {
      await this.afterActedOnBehalf('approve', request, tier, userId);
    }

    await this.resolvePendingNotificationsForRequest(
      request.companyId,
      request.id,
    );

    if (nextApprover) {
      await this.notifyApprovalPending(request.companyId, userId, nextApprover, {
        subject: `Approval required - ${request.requestNumber}`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approvals/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
        excludeRecipientIds: [userId],
      });
    } else {
      if (request.requestedBy !== userId) {
        await this.notifySafe(request.companyId, userId, {
          recipientId: request.requestedBy,
          eventType: APPROVAL_APPROVED_EVENT,
          subject: `Approved - ${request.requestNumber}`,
          body:
            note?.trim() ||
            `Your approval request ${request.requestNumber} has been fully approved.`,
          link: `/approvals/${request.id}`,
          variables: {
            requestId: request.id,
            requestNumber: request.requestNumber,
          },
        });
      }
      await this.dispatchFinalDecision(request.id, 'APPROVED');
    }

    return this.getRequest(request.id, request.companyId, userId);
  }

  /**
   * Approves the PENDING tier assigned to `approverUserId`, even when it is not the
   * current tier (on-behalf creators pre-approve their own tier at submission).
   * Advances / completes the request exactly as a normal approval would.
   * Returns null when the user has no pending tier on the request.
   */
  async autoApproveOwnTier(
    requestId: string,
    companyId: string,
    approverUserId: string,
    comment: string,
  ): Promise<{ tierId: string; completed: boolean } | null> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: {
        id: true,
        status: true,
        requestedBy: true,
        requestNumber: true,
        tiers: {
          where: {
            approverId: approverUserId,
            decision: ApprovalTierDecision.PENDING,
          },
          orderBy: { tierOrder: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    const tier = request?.tiers[0];
    if (!request || !tier) {
      return null;
    }
    this.assertPendingWorkflow(request.status);

    const nextApprover = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            decision: ApprovalTierDecision.APPROVED,
            comment,
            decidedAt: new Date(),
          },
        });
        return this.advanceAfterTierApproval(tx, request.id, approverUserId);
      },
      PRISMA_TX_OPTIONS,
    );

    if (nextApprover) {
      await this.notifyApprovalPending(companyId, approverUserId, nextApprover, {
        subject: `Approval required - ${request.requestNumber}`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approvals/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
        excludeRecipientIds: [approverUserId],
      });
      return { tierId: tier.id, completed: false };
    }

    if (request.requestedBy !== approverUserId) {
      await this.notifySafe(companyId, approverUserId, {
        recipientId: request.requestedBy,
        eventType: APPROVAL_APPROVED_EVENT,
        subject: `Approved - ${request.requestNumber}`,
        body: `Your approval request ${request.requestNumber} has been fully approved.`,
        link: `/approvals/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
      });
    }
    await this.dispatchFinalDecision(request.id, 'APPROVED');
    return { tierId: tier.id, completed: true };
  }

  /**
   * Rejects the tier and the parent request.
   */
  async rejectTier(
    requestId: string,
    tierId: string,
    userId: string,
    note?: string,
    options?: { bypassApproverCheck?: boolean },
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
      options,
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

    await this.resolvePendingNotificationsForRequest(
      request.companyId,
      request.id,
    );

    if (request.requestedBy !== userId) {
      await this.notifySafe(request.companyId, userId, {
        recipientId: request.requestedBy,
        eventType: APPROVAL_REJECTED_EVENT,
        subject: `Rejected - ${request.requestNumber}`,
        body:
          note?.trim() ||
          `Your approval request ${request.requestNumber} was rejected.`,
        link: `/approvals/${request.id}`,
        variables: {
          requestId: request.id,
          requestNumber: request.requestNumber,
        },
      });
    }

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
    options?: {
      /** Full-access roles return the current tier for its assigned approver. */
      onBehalf?: boolean;
    },
  ): Promise<unknown> {
    const { tier, request } = await this.loadTierForAction(
      requestId,
      tierId,
      userId,
      { bypassApproverCheck: options?.onBehalf === true },
    );
    const hrManagerPeer =
      tier.approverId !== userId &&
      (await this.canActAsHrManagerPeer(request.companyId, userId, tier));
    const actingOnBehalf =
      tier.approverId !== userId &&
      !hrManagerPeer &&
      options?.onBehalf === true;
    if (actingOnBehalf) {
      await this.assertCanApproveOnBehalf(request, userId);
    }
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
            ...(actingOnBehalf
              ? { actingApproverId: userId, onBehalfOfApproverId: tier.approverId }
              : {}),
          },
        });
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: ApprovalRequestStatus.RETURNED,
            updatedBy: userId,
          },
        });
        // Durable history row (tier comment is cleared on later actions).
        await tx.approvalResponse.create({
          data: {
            id: randomUUID(),
            requestId: request.id,
            responseType: RESPONSE_TYPE_RETURNED,
            note: note?.trim() || null,
            respondedBy: userId,
          },
        });
      },
      PRISMA_TX_OPTIONS,
    );

    await this.resolvePendingNotificationsForRequest(
      request.companyId,
      request.id,
    );

    await this.notifySafe(request.companyId, userId, {
      recipientId: request.requestedBy,
      eventType: APPROVAL_RETURNED_EVENT,
      subject: `Approval returned - ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Your approval request ${request.requestNumber} was returned for revision.`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
    });

    if (actingOnBehalf) {
      await this.afterActedOnBehalf('return', request, tier, userId);
    }

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
            requestNumber: true,
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
      await this.notifyApprovalPending(request.companyId, userId, nextApprover, {
        subject: `Approval required`,
        body: `A request is awaiting your approval at tier "${nextApprover.label}".`,
        link: `/approvals/${request.id}`,
        variables: { requestId: request.id },
        excludeRecipientIds: [userId],
      });
    } else if (shouldAdvance) {
      if (request.requestedBy !== userId) {
        await this.notifySafe(request.companyId, userId, {
          recipientId: request.requestedBy,
          eventType: APPROVAL_APPROVED_EVENT,
          subject: `Approved - ${request.requestNumber}`,
          body: `Your approval request ${request.requestNumber} has been fully approved.`,
          link: `/approvals/${request.id}`,
          variables: {
            requestId: request.id,
            requestNumber: request.requestNumber,
          },
        });
      }
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
        leaveRequest: {
          include: { periods: { orderBy: { startDate: 'asc' } } },
        },
        overtimeSheet: true,
        flightApplication: true,
        businessTrip: true,
        expenseClaim: true,
        perDiemRequest: true,
        perDiemSettlement: true,
        purchaseRequest: true,
        materialRequisition: true,
        consumablesRequisition: true,
        vehicleApplication: true,
        vehicleRefueling: true,
        officialSeal: true,
        exitPermit: true,
        siteAssignment: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.requestedBy !== userId) {
      throw new ForbiddenException('Only the requester can resubmit');
    }
    if (request.status !== ApprovalRequestStatus.RETURNED) {
      throw new ForbiddenException('Only returned requests can be resubmitted.');
    }
    await this.assertSourceReadyToResubmit(request);

    const responseId = randomUUID();
    if (request.tiers.length === 0) {
      throw new BadRequestException('Approval chain has no tiers');
    }

    // Resume at the returned tier only — earlier APPROVED tiers stay approved.
    const returnedTiers = request.tiers
      .filter((tier) => tier.decision === ApprovalTierDecision.RETURNED)
      .sort((a, b) => b.tierOrder - a.tierOrder);
    const resumeTier = returnedTiers[0] ?? request.tiers[0];

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

        // Reset only the returned tier (and any later tiers if present).
        for (const tier of request.tiers) {
          if (tier.tierOrder < resumeTier.tierOrder) {
            continue;
          }
          await tx.approvalTier.update({
            where: { id: tier.id },
            data: {
              decision: ApprovalTierDecision.PENDING,
              comment: null,
              decidedAt: null,
              conditions: [],
              actingApproverId: null,
              onBehalfOfApproverId: null,
            },
          });
        }

        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: ApprovalRequestStatus.SUBMITTED,
            currentTier: resumeTier.tierOrder,
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

        if (request.perDiemSettlement) {
          await tx.perDiemSettlement.update({
            where: { id: request.perDiemSettlement.id },
            data: {
              status: PerDiemStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.purchaseRequest) {
          await tx.purchaseRequest.update({
            where: { id: request.purchaseRequest.id },
            data: {
              status: PurchaseRequestStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.materialRequisition) {
          await tx.materialRequisition.update({
            where: { id: request.materialRequisition.id },
            data: {
              status: MaterialRequisitionStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.consumablesRequisition) {
          await tx.consumablesRequisition.update({
            where: { id: request.consumablesRequisition.id },
            data: {
              status: ConsumablesRequisitionStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.vehicleApplication) {
          await tx.vehicleApplication.update({
            where: { id: request.vehicleApplication.id },
            data: {
              status: VehicleApplicationStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.vehicleRefueling) {
          await tx.vehicleRefueling.update({
            where: { id: request.vehicleRefueling.id },
            data: {
              status: VehicleRefuelingStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }
        if (request.officialSeal) {
          await tx.officialSeal.update({
            where: { id: request.officialSeal.id },
            data: {
              status: SealStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.exitPermit) {
          await tx.exitPermit.update({
            where: { id: request.exitPermit.id },
            data: {
              status: ExitPermitStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }

        if (request.siteAssignment) {
          await tx.siteAssignment.update({
            where: { id: request.siteAssignment.id },
            data: {
              status: SiteAssignmentStatus.SUBMITTED,
              completedAt: null,
              updatedBy: userId,
            },
          });
        }
      },
      PRISMA_TX_OPTIONS,
    );

    if (request.leaveRequest) {
      const startDate =
        request.leaveRequest.startDate ??
        request.leaveRequest.periods[0]?.startDate;
      if (!startDate) {
        throw new BadRequestException(
          'Leave request is missing dates and cannot be resubmitted',
        );
      }
      await this.leaveBalanceService.adjustPendingForDate(
        request.leaveRequest.employeeId,
        request.leaveRequest.leaveType,
        startDate,
        Number(request.leaveRequest.days ?? 0),
        companyId,
      );
    }

    await this.notifyApprovalPending(companyId, userId, resumeTier, {
      subject: `Resubmitted for approval - ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Request ${request.requestNumber} was resubmitted and awaits your review at tier "${resumeTier.label}".`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
      excludeRecipientIds: [userId],
    });

    const category = await this.prisma.approvalCategory.findFirst({
      where: { id: request.categoryId },
      select: { code: true },
    });
    if (category) {
      this.enqueueAutoApproveAll(request.id, companyId, category.code);
    }

    return this.getRequest(request.id, companyId, userId);
  }

  /**
   * Restarts the approval chain after the requester edits a submitted/approved
   * source record (e.g. overtime). Prior tier decisions are cleared but kept in
   * response history via a RESUBMIT response. Notifies the first approver.
   */
  async restartChainAfterEdit(
    requestId: string,
    companyId: string,
    userId: string,
    note?: string,
  ): Promise<void> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      include: {
        tiers: { orderBy: { tierOrder: 'asc' } },
        overtimeSheet: true,
        category: { select: { code: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    // Requester or on-behalf creator (overtime service already authorized the actor).
    if (request.requestedBy !== userId && request.createdBy !== userId) {
      throw new ForbiddenException('Only the requester can restart approval');
    }

    const restartable: ApprovalRequestStatus[] = [
      ApprovalRequestStatus.SUBMITTED,
      ApprovalRequestStatus.IN_REVIEW,
      ApprovalRequestStatus.PENDING,
      ApprovalRequestStatus.APPROVED,
      ApprovalRequestStatus.RETURNED,
    ];
    if (!restartable.includes(request.status)) {
      throw new BadRequestException(
        'This approval cannot be restarted from its current status',
      );
    }

    if (request.tiers.length === 0) {
      throw new BadRequestException('Approval chain has no tiers');
    }

    // If the sheet was returned mid-chain, resume at that tier; otherwise
    // restart from the beginning (edit of an in-flight/approved sheet).
    const returnedTiers = request.tiers
      .filter((tier) => tier.decision === ApprovalTierDecision.RETURNED)
      .sort((a, b) => b.tierOrder - a.tierOrder);
    const resumeTier = returnedTiers[0] ?? request.tiers[0];
    const resumeOnly = Boolean(returnedTiers[0]);

    const responseId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.approvalResponse.create({
        data: {
          id: responseId,
          requestId: request.id,
          responseType: RESPONSE_TYPE_RESUBMIT,
          note:
            note?.trim() ||
            (resumeOnly
              ? 'Request edited and resubmitted after return'
              : 'Request edited by employee — approval chain restarted'),
          respondedBy: userId,
        },
      });

      for (const tier of request.tiers) {
        if (resumeOnly && tier.tierOrder < resumeTier.tierOrder) {
          continue;
        }
        await tx.approvalTier.update({
          where: { id: tier.id },
          data: {
            decision: ApprovalTierDecision.PENDING,
            comment: null,
            decidedAt: null,
            conditions: [],
            actingApproverId: null,
            onBehalfOfApproverId: null,
          },
        });
      }

      await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: ApprovalRequestStatus.SUBMITTED,
          currentTier: resumeTier.tierOrder,
          completedAt: null,
          updatedBy: userId,
        },
      });

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
    }, PRISMA_TX_OPTIONS);

    await this.notifyApprovalPending(companyId, userId, resumeTier, {
      subject: `Edited overtime resubmitted - ${request.requestNumber}`,
      body:
        note?.trim() ||
        `Overtime request ${request.requestNumber} was edited and awaits your review at tier "${resumeTier.label}".`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
      },
      excludeRecipientIds: [userId],
    });

    if (request.category?.code) {
      this.enqueueAutoApproveAll(request.id, companyId, request.category.code);
    }
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
      subject: `Condition response - ${request.requestNumber}`,
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
    if (decision === 'APPROVED') {
      const request = await this.prisma.approvalRequest.findFirst({
        where: activeOnly({ id: approvalRequestId }),
        include: { category: { select: { code: true } } },
      });
      if (request?.isLateSubmission) {
        const months = payrollMonthsFromApprovalRequest({
          categoryCode: request.category?.code ?? null,
          formData: request.formData,
        });
        for (const period of months) {
          await markPayrollAttendanceSnapshotStale(
            this.prisma,
            request.companyId,
            period.month,
            period.year,
          );
        }
      }
    }
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
   * Same item rules as the first submit, for records edited while RETURNED
   * (edits no longer resubmit; this is the only way back into the chain).
   */
  private async assertSourceReadyToResubmit(request: {
    expenseClaim?: { id: string } | null;
    materialRequisition?: { id: string } | null;
    exitPermit?: { id: string } | null;
  }): Promise<void> {
    if (request.expenseClaim) {
      const items = await this.prisma.expenseClaimItem.findMany({
        where: { claimId: request.expenseClaim.id },
        select: { _count: { select: { receipts: true } } },
      });
      if (items.length === 0) {
        throw new BadRequestException(
          'Add at least one expense item before submitting',
        );
      }
      if (items.some((item) => item._count.receipts === 0)) {
        throw new BadRequestException(
          'Every expense item requires a receipt before submitting',
        );
      }
    }
    if (request.materialRequisition) {
      const count = await this.prisma.materialRequisitionItem.count({
        where: { requisitionId: request.materialRequisition.id },
      });
      if (count === 0) {
        throw new BadRequestException('Add at least one item before submitting');
      }
    }
    if (request.exitPermit) {
      const count = await this.prisma.exitPermitItem.count({
        where: { requestId: request.exitPermit.id },
      });
      if (count === 0) {
        throw new BadRequestException('Add at least one item before submitting');
      }
    }
  }

  /**
   * Ensures the caller may view this approval request.
   */
  private async assertCanViewRequest(
    request: {
      id: string;
      requestedBy: string;
      status: ApprovalRequestStatus;
      tiers: Array<{
        approverId: string;
        label?: string | null;
        resolver?: string | null;
      }>;
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
    // Cancelled requests are hidden from the approval chain (requester and
    // full-access HR / admins still see them read-only).
    const isApprover =
      request.status !== ApprovalRequestStatus.CANCELLED &&
      request.tiers.some((t) => t.approverId === userId);
    if (isRequester || isApprover) {
      return;
    }

    if (request.status !== ApprovalRequestStatus.CANCELLED) {
      const hrManagers = await this.findActiveHrManagerUserIds(companyId);
      if (hrManagers.includes(userId)) {
        const peerTier = request.tiers.find(
          (t) =>
            this.isHrManagerApprovalTier(t) &&
            hrManagers.includes(t.approverId),
        );
        if (peerTier) {
          return;
        }
      }
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

  /**
   * Approve on behalf: full-access roles only, never on a request the actor
   * submitted/filed (createdBy) or is the subject of (requestedBy).
   */
  private async assertCanApproveOnBehalf(
    request: { companyId: string; requestedBy: string; createdBy: string },
    userId: string,
  ): Promise<void> {
    if (!(await this.isFullAccessApprover(userId, request.companyId))) {
      throw new ForbiddenException(APPROVE_ON_BEHALF_ROLE_MESSAGE);
    }
    if (request.createdBy === userId) {
      throw new ForbiddenException(APPROVE_ON_BEHALF_OWN_SUBMISSION_MESSAGE);
    }
    if (request.requestedBy === userId) {
      throw new ForbiddenException(APPROVE_ON_BEHALF_OWN_REQUEST_MESSAGE);
    }
  }

  /** Primary role GM, MD, HR Manager, HR Officer or System Administrator. */
  private async isFullAccessApprover(userId: string, companyId: string): Promise<boolean> {
    const primary = await this.prisma.userRole.findFirst({
      where: activeOnly({
        userId,
        isPrimary: true,
        role: activeOnly({ companyId }),
      }),
      select: { role: { select: { name: true } } },
    });
    return primary !== null && HR_OR_FULL_ACCESS_ROLES.includes(primary.role.name);
  }

  /** Approve / return on behalf: tells the assigned approver and writes the audit entry. */
  private async afterActedOnBehalf(
    action: 'approve' | 'return',
    request: { id: string; companyId: string; requestNumber: string },
    tier: { id: string; label: string; approverId: string },
    actingUserId: string,
  ): Promise<void> {
    const people = await this.prisma.user.findMany({
      where: { id: { in: [actingUserId, tier.approverId] } },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    });
    const nameOf = (id: string): string => {
      const user = people.find((row) => row.id === id);
      return user
        ? [user.firstName, user.middleName, user.lastName]
            .filter((part) => Boolean(part && part.trim()))
            .join(' ')
        : id;
    };
    const actingName = nameOf(actingUserId);
    const assignedName = nameOf(tier.approverId);

    const verb = action === 'approve' ? 'approved' : 'returned';
    await this.notifySafe(request.companyId, actingUserId, {
      recipientId: tier.approverId,
      eventType:
        action === 'approve'
          ? APPROVAL_APPROVED_ON_BEHALF_EVENT
          : APPROVAL_RETURNED_ON_BEHALF_EVENT,
      subject: `${action === 'approve' ? 'Approved' : 'Returned'} on your behalf - ${request.requestNumber}`,
      body: `${actingName} ${verb} the "${tier.label}" tier of ${request.requestNumber} on your behalf.`,
      link: `/approvals/${request.id}`,
      variables: {
        requestId: request.id,
        requestNumber: request.requestNumber,
        actingApproverName: actingName,
      },
    });

    if (this.audit) {
      await this.audit.create(
        this.audit.buildFromRequestContext({
          userId: actingUserId,
          companyId: request.companyId,
          module: 'approvals',
          action: `${action}_on_behalf`,
          recordType: 'approval_tier',
          recordId: tier.id,
          recordReference: request.requestNumber,
          afterValue: {
            requestId: request.id,
            tierLabel: tier.label,
            actingApproverId: actingUserId,
            actingApproverName: actingName,
            onBehalfOfApproverId: tier.approverId,
            onBehalfOfApproverName: assignedName,
          } as Prisma.InputJsonValue,
        }),
      );
    }
  }

  private async loadTierForAction(
    requestId: string,
    tierId: string,
    userId: string,
    options?: { bypassApproverCheck?: boolean },
  ): Promise<{
    tier: {
      id: string;
      tierOrder: number;
      label: string;
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
      createdBy: string;
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
            createdBy: true,
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

    if (
      tier.approverId !== userId &&
      options?.bypassApproverCheck !== true
    ) {
      const peerOk = await this.canActAsHrManagerPeer(
        tier.request.companyId,
        userId,
        {
          label: tier.label,
          resolver: tier.resolver,
          approverId: tier.approverId,
        },
      );
      if (!peerOk) {
        throw new ForbiddenException(
          'Only the assigned approver can act on this tier',
        );
      }
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
        label: tier.label,
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
        createdBy: tier.request.createdBy,
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
  ): Promise<{
    approverId: string;
    label: string;
    resolver: string | null;
  } | null> {
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

      return {
        approverId: next.approverId,
        label: next.label,
        resolver: next.resolver,
      };
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

  /** True when the tier is the shared HR Manager approval step. */
  private isHrManagerApprovalTier(tier: {
    label?: string | null;
    resolver?: string | null;
  }): boolean {
    const label = (tier.label ?? '').trim().toLowerCase();
    const resolver = (tier.resolver ?? '').trim().toLowerCase();
    return (
      label === 'hr manager' ||
      label === 'local hr manager' ||
      label === 'hr officer' ||
      resolver === 'role:hr manager' ||
      resolver === 'role:local hr manager' ||
      resolver === 'role:hr officer'
    );
  }

  /**
   * Active users whose primary role is HR Manager (or Local HR Manager /
   * HR Officer fallback used as the company HR Manager seat).
   */
  private async findActiveHrManagerUserIds(
    companyId: string,
  ): Promise<string[]> {
    const roleNames = ['HR Manager', 'Local HR Manager', 'HR Officer'];
    const users = await this.prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        employmentStatus: 'ACTIVE' as const,
        userRoles: {
          some: activeOnly({
            isPrimary: true,
            role: activeOnly({
              companyId,
              name: { in: roleNames },
            }),
          }),
        },
      }),
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((row) => row.id);
  }

  /**
   * Sends approval-pending notifications. When the tier is HR Manager,
   * every active HR Manager receives it (any one may act).
   */
  private async notifyApprovalPending(
    companyId: string,
    actorUserId: string,
    tier: {
      approverId: string;
      label?: string | null;
      resolver?: string | null;
    },
    payload: {
      subject: string;
      body: string;
      link?: string;
      variables?: Record<string, string>;
      excludeRecipientIds?: string[];
    },
  ): Promise<void> {
    const exclude = new Set(payload.excludeRecipientIds ?? []);
    let recipientIds = [tier.approverId];
    if (this.isHrManagerApprovalTier(tier)) {
      const managers = await this.findActiveHrManagerUserIds(companyId);
      if (managers.length > 0) {
        recipientIds = managers;
      }
    }
    await Promise.all(
      recipientIds
        .filter((id) => id && !exclude.has(id))
        .map((recipientId) =>
          this.notifySafe(companyId, actorUserId, {
            recipientId,
            eventType: APPROVAL_PENDING_EVENT,
            subject: payload.subject,
            body: payload.body,
            link: payload.link,
            variables: payload.variables,
          }),
        ),
    );
  }

  /**
   * True when the user may act on a pending HR Manager tier assigned to a peer.
   */
  private async canActAsHrManagerPeer(
    companyId: string,
    userId: string,
    tier: { label?: string | null; resolver?: string | null; approverId: string },
  ): Promise<boolean> {
    if (!this.isHrManagerApprovalTier(tier)) {
      return false;
    }
    if (tier.approverId === userId) {
      return true;
    }
    const managers = await this.findActiveHrManagerUserIds(companyId);
    return managers.includes(userId) && managers.includes(tier.approverId);
  }

  /**
   * Marks unread approval-pending notifications for a request as read for every
   * recipient (e.g. all HR Managers after one of them acts).
   */
  private async resolvePendingNotificationsForRequest(
    companyId: string,
    requestId: string,
  ): Promise<void> {
    const link = `/approvals/${requestId}`;
    try {
      await this.prisma.notification.updateMany({
        where: {
          companyId,
          channel: NotificationChannel.IN_APP,
          readAt: null,
          OR: [{ link }, { link: { startsWith: `${link}?` } }],
        },
        data: {
          readAt: new Date(),
          status: NotificationStatus.READ,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to resolve pending notifications for ${requestId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Resolves category rules; on auto-approve mode, empty/failed chains become
   * a single "Test auto-approval" tier.
   */
  private async resolveRuleWithAutoApproveFallback(
    companyId: string,
    userId: string,
    approvalRules: unknown,
    formData: Record<string, unknown>,
  ): Promise<MatchedApprovalRule> {
    const mode = getAutoApproveModeFromEnv();
    try {
      return await this.resolver.resolveRule(
        companyId,
        userId,
        approvalRules,
        formData,
      );
    } catch (error: unknown) {
      if (!mode.active) {
        throw error;
      }
      this.logger.warn(
        `AUTO_APPROVE_ALL: rule resolution failed, using fallback tier: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ruleName: AUTO_APPROVE_FALLBACK_TIER_LABEL,
        tiers: [this.buildAutoApproveFallbackTier(mode.actorId)],
      };
    }
  }

  private buildAutoApproveFallbackTier(actorId: string): ResolvedApprovalTier {
    return {
      tierOrder: 1,
      label: AUTO_APPROVE_FALLBACK_TIER_LABEL,
      approverId: actorId,
      resolver: 'AUTO_APPROVE_FALLBACK',
    };
  }

  /**
   * Schedules full-chain auto-approval after the submit/resubmit call stack
   * (and module linking) finishes. Failures leave the request pending.
   */
  private enqueueAutoApproveAll(
    requestId: string,
    companyId: string,
    categoryCode: string,
  ): void {
    const mode = getAutoApproveModeFromEnv();
    if (!mode.active || isAutoApproveExcludedCategory(categoryCode)) {
      return;
    }

    setImmediate(() => {
      void this.runAutoApproveAll(requestId, companyId, mode.actorId).catch(
        (error: unknown) => {
          this.logger.error(
            `AUTO_APPROVE_ALL failed for request ${requestId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
    });
  }

  /**
   * Approves every pending tier in order via approveTier (same path as UI).
   */
  private async runAutoApproveAll(
    requestId: string,
    companyId: string,
    actorId: string,
  ): Promise<void> {
    await this.waitForAutoApproveReady(requestId, companyId);

    const maxSteps = 20;
    for (let step = 0; step < maxSteps; step += 1) {
      const request = await this.prisma.approvalRequest.findFirst({
        where: activeOnly({ id: requestId, companyId }),
        select: {
          id: true,
          status: true,
          currentTier: true,
          tiers: {
            orderBy: { tierOrder: 'asc' },
            select: {
              id: true,
              tierOrder: true,
              decision: true,
            },
          },
        },
      });

      if (!request) {
        return;
      }

      if (
        request.status === ApprovalRequestStatus.APPROVED ||
        request.status === ApprovalRequestStatus.REJECTED ||
        request.status === ApprovalRequestStatus.CANCELLED ||
        request.status === ApprovalRequestStatus.RETURNED
      ) {
        return;
      }

      const current = request.tiers.find(
        (tier) =>
          tier.tierOrder === request.currentTier &&
          (tier.decision === ApprovalTierDecision.PENDING ||
            tier.decision === ApprovalTierDecision.CONDITIONALLY_APPROVED),
      );
      if (!current) {
        return;
      }

      try {
        await this.approveTier(
          requestId,
          current.id,
          actorId,
          AUTO_APPROVE_COMMENT,
          { bypassApproverCheck: true },
        );
      } catch (error: unknown) {
        this.logger.error(
          `AUTO_APPROVE_ALL stopped at tier ${current.tierOrder} on ${requestId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
    }
  }

  /**
   * Waits briefly for domain modules to link their records after submitRequest
   * returns (leave/overtime create the row after the approval request).
   */
  private async waitForAutoApproveReady(
    requestId: string,
    companyId: string,
  ): Promise<void> {
    const maxAttempts = 40;
    const delayMs = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const request = await this.prisma.approvalRequest.findFirst({
        where: activeOnly({ id: requestId, companyId }),
        select: {
          status: true,
          leaveRequest: { select: { id: true } },
          overtimeSheet: { select: { id: true } },
          flightApplication: { select: { id: true } },
          businessTrip: { select: { id: true } },
          expenseClaim: { select: { id: true } },
          perDiemRequest: { select: { id: true } },
          perDiemSettlement: { select: { id: true } },
          purchaseRequest: { select: { id: true } },
          materialRequisition: { select: { id: true } },
          consumablesRequisition: { select: { id: true } },
          vehicleApplication: { select: { id: true } },
          vehicleRefueling: { select: { id: true } },
          officialSeal: { select: { id: true } },
          projectSeal: { select: { id: true } },
          exitPermit: { select: { id: true } },
          siteAssignment: { select: { id: true } },
          fieldMovementLog: { select: { id: true } },
          category: { select: { code: true } },
        },
      });

      if (!request) {
        return;
      }

      if (
        request.status === ApprovalRequestStatus.CANCELLED ||
        request.status === ApprovalRequestStatus.APPROVED
      ) {
        return;
      }

      const linked =
        request.leaveRequest ||
        request.overtimeSheet ||
        request.flightApplication ||
        request.businessTrip ||
        request.expenseClaim ||
        request.perDiemRequest ||
        request.perDiemSettlement ||
        request.purchaseRequest ||
        request.materialRequisition ||
        request.consumablesRequisition ||
        request.vehicleApplication ||
        request.vehicleRefueling ||
        request.officialSeal ||
        request.projectSeal ||
        request.exitPermit ||
        request.siteAssignment ||
        request.fieldMovementLog;

      if (linked) {
        return;
      }

      // Generic / rule-only categories never get a module link.
      if (attempt >= 4 && !this.categoryExpectsModuleLink(request.category.code)) {
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  private categoryExpectsModuleLink(categoryCode: string): boolean {
    return [
      'LEAVE_REQUEST',
      'OVERTIME_APPLICATION',
      'FLIGHT_APPLICATION',
      'BUSINESS_TRIP',
      'EXPENSE_CLAIM',
      'PER_DIEM',
      'PER_DIEM_SETTLEMENT',
      'PURCHASE_REQUEST',
      'MATERIAL_REQUISITION',
      'CONSUMABLES_REQUISITION',
      'VEHICLE_APPLICATION',
      'VEHICLE_REFUELING',
      'OFFICIAL_SEAL_USAGE',
      'PROJECT_SEAL_USAGE',
      'EXIT_PERMIT',
      'SITE_ASSIGNMENT',
      'FIELD_MOVEMENT_LOG',
      'WORK_FROM_HOME',
    ].includes(categoryCode);
  }
}
