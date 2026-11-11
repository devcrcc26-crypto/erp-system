import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestInitiatorType } from '@prisma/client';
import { getPolicy } from '../../shared/policy/policy-reader.util';
import type {
  InitiatorRequestType,
  RequestInitiator,
} from '../../shared/policy/policy-definitions';
import { PermissionService } from '../../shared/permissions/permission.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { activeOnly } from '../../shared/prisma/soft-delete.util';
import {
  EXCLUDED_FROM_HR_MESSAGE,
  hrProcessEmployeeWhere,
  isExcludedFromHrProcesses,
} from '../../shared/prisma/hr-process.util';
import { AuditService } from '../audit/application/services/audit.service';
import { ApprovalsService } from '../approvals/application/services/approvals.service';
import {
  HrApprovalChainService,
  HrOnBehalfModuleCode,
} from '../hr-shared/application/services/hr-approval-chain.service';

export interface OnBehalfEligibleEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
  gender: 'MALE' | 'FEMALE' | null;
}

/** Who a request is for, and the capacity the actor filed it in. */
export interface RequestInitiation {
  employeeId: string;
  initiatedAs: RequestInitiatorType;
}

/** Employee the actor may pick (on-behalf target, crew member or passenger). */
export interface InitiableEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  department: string | null;
  position: string | null;
  /** How the actor may file for them. */
  initiatedAs: RequestInitiatorType;
}

const REQUEST_TYPE_LABEL: Record<InitiatorRequestType, string> = {
  SITE_ASSIGNMENT: 'site assignment',
  WORK_FROM_HOME: 'work-from-home request',
  FLIGHT_APPLICATION: 'flight application',
  BUSINESS_TRIP: 'business trip',
};

export const ON_BEHALF_AUTO_APPROVE_COMMENT =
  'Auto-approved by creator (on-behalf submission)';

export { EXCLUDED_FROM_HR_MESSAGE };

const CREATE_ON_BEHALF_ACTION = 'CREATE_ON_BEHALF';

/**
 * Modules where a delegate may not auto-approve their own tier. Site
 * assignments make scheduled hours claimable as OT, so every tier is decided
 * by its approver.
 */
const AUTO_APPROVE_BLOCKED_MODULES: ReadonlySet<HrOnBehalfModuleCode> = new Set([
  'SITE_ASSIGNMENT',
]);

export function isOnBehalfAutoApproveAllowed(
  moduleCode: HrOnBehalfModuleCode,
): boolean {
  return !AUTO_APPROVE_BLOCKED_MODULES.has(moduleCode);
}
const AUTO_APPROVE_ACTION = 'ON_BEHALF_AUTO_APPROVE';

/** Site assignment on-behalf: only direct reports (and their crew), not company-wide HR. */
const SITE_ASSIGNMENT_DIRECT_REPORTS_ONLY_ROLES: readonly string[] = [
  'HR Manager',
  'Local HR Manager',
];

/** Audit module name and record type per on-behalf module. */
const MODULE_AUDIT: Record<
  HrOnBehalfModuleCode,
  { module: string; recordType: string }
> = {
  LEAVE_REQUEST: { module: 'leave', recordType: 'LeaveRequest' },
  EXPENSE_CLAIM: { module: 'expense-claim', recordType: 'ExpenseClaim' },
  PURCHASE_REQUEST: { module: 'purchase-request', recordType: 'PurchaseRequest' },
  MATERIAL_REQUISITION: {
    module: 'material-requisition',
    recordType: 'MaterialRequisition',
  },
  CONSUMABLES_REQUISITION: {
    module: 'consumables',
    recordType: 'ConsumablesRequisition',
  },
  FLIGHT_APPLICATION: { module: 'flight', recordType: 'FlightApplication' },
  BUSINESS_TRIP: { module: 'business-trip', recordType: 'BusinessTrip' },
  PER_DIEM: { module: 'per-diem', recordType: 'PerDiemRequest' },
  VEHICLE_APPLICATION: {
    module: 'vehicle-application',
    recordType: 'VehicleApplication',
  },
  OFFICIAL_SEAL_USAGE: { module: 'official-seal', recordType: 'OfficialSeal' },
  PROJECT_SEAL_USAGE: { module: 'project-seal', recordType: 'ProjectSeal' },
  VEHICLE_REFUELING: {
    module: 'vehicle-refueling',
    recordType: 'VehicleRefueling',
  },
  OVERTIME_APPLICATION: { module: 'overtime', recordType: 'OvertimeSheet' },
  FIELD_MOVEMENT_LOG: {
    module: 'field-movement',
    recordType: 'FieldMovementLog',
  },
  INSPECTION_REPAIR: {
    module: 'inspection-repair',
    recordType: 'InspectionRepair',
  },
  EXIT_PERMIT: { module: 'exit-permit', recordType: 'ExitPermit' },
  SITE_ASSIGNMENT: {
    module: 'site-assignment',
    recordType: 'SiteAssignment',
  },
  WORK_FROM_HOME: {
    module: 'work-from-home',
    recordType: 'WorkFromHomeDay',
  },
  ASSET_REQUEST: { module: 'asset-request', recordType: 'AssetRequest' },
};

/**
 * "Submit on behalf of" rules shared by every HR request module.
 *
 * - HR (hr.view) and full-access roles: any active employee in the company.
 * - Department head (Department.leaderUserId): employees of the departments they lead.
 *   Departments are flat today; when sub-departments exist, extend `ledDepartmentIds`.
 * - Discipline lead (Discipline.leaderId): employees of the disciplines they lead.
 * - Everyone else: nobody. The actor is never eligible as their own on-behalf target.
 * - Approver-only accounts (excludedFromHrProcesses) are never a target.
 */
@Injectable()
export class OnBehalfService {
  private readonly logger = new Logger(OnBehalfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly approvalsService: ApprovalsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Employees the user may submit HR requests on behalf of (never includes the user).
   */
  async getEligibleEmployees(
    userId: string,
    companyId: string,
  ): Promise<OnBehalfEligibleEmployee[]> {
    const where = await this.eligibleEmployeesWhere(userId, companyId);
    if (!where) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        gender: true,
        department: { select: { name: true } },
        engineeringDiscipline: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department?.name ?? null,
      discipline: user.engineeringDiscipline?.name ?? null,
      gender: user.gender,
    }));
  }

  /**
   * True when the user may submit on behalf of `targetEmployeeId`.
   * Self-submission (target === user) is always allowed.
   */
  async isEligibleFor(
    userId: string,
    targetEmployeeId: string,
    companyId: string,
  ): Promise<boolean> {
    if (targetEmployeeId === userId) {
      return true;
    }
    const where = await this.eligibleEmployeesWhere(userId, companyId);
    if (!where) {
      return false;
    }
    const match = await this.prisma.user.findFirst({
      where: { AND: [where, { id: targetEmployeeId }] },
      select: { id: true },
    });
    return match !== null;
  }

  /**
   * Whether the user holds a tier in the chain `moduleCode` would open for the target.
   */
  async isInApprovalChain(
    userId: string,
    targetEmployeeId: string,
    companyId: string,
    moduleCode: HrOnBehalfModuleCode,
  ): Promise<{
    isInChain: boolean;
    tierLabel: string | null;
    autoApproveAllowed: boolean;
  }> {
    const autoApproveAllowed = isOnBehalfAutoApproveAllowed(moduleCode);
    const notInChain = { isInChain: false, tierLabel: null, autoApproveAllowed };
    if (
      targetEmployeeId === userId ||
      !(await this.isEligibleFor(userId, targetEmployeeId, companyId))
    ) {
      return notInChain;
    }
    const tier = await this.hrApprovalChain.findUserTierInModuleChain(
      userId,
      moduleCode,
      targetEmployeeId,
      companyId,
    );
    return tier
      ? { isInChain: true, tierLabel: tier.label, autoApproveAllowed }
      : notInChain;
  }

  /**
   * Resolves who a new request belongs to. Omitted / own id → the actor.
   * Throws when the actor may not submit on behalf of the given employee.
   */
  async resolveTargetEmployeeId(
    actorUserId: string,
    companyId: string,
    onBehalfOfEmployeeId?: string | null,
  ): Promise<string> {
    if (!onBehalfOfEmployeeId || onBehalfOfEmployeeId === actorUserId) {
      return actorUserId;
    }
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: onBehalfOfEmployeeId, companyId }),
      select: { id: true, excludedFromHrProcesses: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (isExcludedFromHrProcesses(employee)) {
      throw new BadRequestException(EXCLUDED_FROM_HR_MESSAGE);
    }
    if (!(await this.isEligibleFor(actorUserId, onBehalfOfEmployeeId, companyId))) {
      throw new ForbiddenException(
        'You do not have permission to submit on behalf of this employee',
      );
    }
    return onBehalfOfEmployeeId;
  }

  /**
   * allowedInitiators policy for a request type, read now (the key takes
   * effect when saved).
   */
  async allowedInitiators(
    companyId: string,
    requestType: InitiatorRequestType,
  ): Promise<RequestInitiator[]> {
    const policy = await getPolicy(this.prisma, companyId, 'allowedInitiators', new Date());
    return policy[requestType];
  }

  /**
   * Who a Site Assignment / WFH / Flight / Business Trip request is for, and in
   * what capacity the actor files it:
   * - SELF: no target (or own id), if the request type allows SELF.
   * - SUPERVISOR: target.reportsToUserId = actor (direct reports only), if allowed.
   * - DELEGATE: full-access role (any active employee except site assignment),
   *   direct reports of a supervisor the actor may file for (site assignment only),
   *   or the on-behalf scope (HR / department head / discipline lead) if allowed.
   * SUPERVISOR wins over DELEGATE so the approval chain starts above the supervisor.
   * `hrProcess`: the subject must take part in HR processes (site, WFH).
   */
  async resolveInitiation(
    actorUserId: string,
    companyId: string,
    requestType: InitiatorRequestType,
    targetEmployeeId?: string | null,
    options?: { hrProcess?: boolean },
  ): Promise<RequestInitiation> {
    const allowed = await this.allowedInitiators(companyId, requestType);
    const label = REQUEST_TYPE_LABEL[requestType];

    if (!targetEmployeeId || targetEmployeeId === actorUserId) {
      if (!allowed.includes('SELF')) {
        throw new ForbiddenException(
          `You can't file a ${label} for yourself. Ask your supervisor or HR to file it for you.`,
        );
      }
      if (options?.hrProcess) {
        await this.assertTakesPartInHrProcesses(actorUserId, companyId);
      }
      return { employeeId: actorUserId, initiatedAs: RequestInitiatorType.SELF };
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: targetEmployeeId, companyId, isActive: true }),
      select: { id: true, excludedFromHrProcesses: true, reportsToUserId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    // Site assignment on-behalf is the exception: approver-only accounts can be
    // the subject when someone else files for them (they still cannot self-file).
    if (
      isExcludedFromHrProcesses(employee) &&
      requestType !== 'SITE_ASSIGNMENT'
    ) {
      throw new BadRequestException(EXCLUDED_FROM_HR_MESSAGE);
    }

    const initiatedAs = await this.initiatorFor(
      actorUserId,
      employee,
      companyId,
      allowed,
      requestType,
    );
    if (!initiatedAs) {
      throw new ForbiddenException(
        `You can't file a ${label} for this employee. Allowed: ${allowed
          .map((a) => a.toLowerCase())
          .join(', ')}.`,
      );
    }
    return { employeeId: employee.id, initiatedAs };
  }

  /**
   * Employees the actor may pick for a request type (excluding themselves unless
   * `includeSelf` and SELF is allowed).
   * - `approverOnly`: only approver-only accounts (site-assignment on-behalf).
   * - `includeApproverOnly`: keep both (flight / business-trip passengers).
   * - default: HR-process employees only (exclude approver-only).
   */
  async getInitiableEmployees(
    actorUserId: string,
    companyId: string,
    requestType: InitiatorRequestType,
    options?: {
      includeSelf?: boolean;
      includeApproverOnly?: boolean;
      approverOnly?: boolean;
      /** Site assignment crew: direct reports of this supervisor (actor must file for them). */
      crewSupervisorId?: string;
    },
  ): Promise<InitiableEmployee[]> {
    const allowed = await this.allowedInitiators(companyId, requestType);
    const limitedSiteAssignment = await this.siteAssignmentLimitedToDirectReports(
      actorUserId,
      companyId,
      requestType,
    );
    const fullAccess =
      !limitedSiteAssignment &&
      (await this.hrApprovalChain.isHrOrFullAccessActor(actorUserId, companyId));

    if (options?.crewSupervisorId) {
      if (requestType !== 'SITE_ASSIGNMENT') {
        throw new BadRequestException(
          'crewSupervisorId is only supported for site assignment',
        );
      }
      const supervisor = await this.prisma.user.findFirst({
        where: activeOnly({
          id: options.crewSupervisorId,
          companyId,
          isActive: true,
        }),
        select: { id: true, reportsToUserId: true },
      });
      if (!supervisor) {
        throw new NotFoundException('Supervisor not found');
      }
      const mayFileForSupervisor = await this.initiatorFor(
        actorUserId,
        supervisor,
        companyId,
        allowed,
        requestType,
      );
      if (!mayFileForSupervisor) {
        throw new ForbiddenException(
          'You cannot list crew for this on-behalf employee',
        );
      }
    }
    const exclusionFilter = options?.approverOnly
      ? { excludedFromHrProcesses: true as const }
      : options?.includeApproverOnly
        ? {}
        : hrProcessEmployeeWhere({});
    const base: Prisma.UserWhereInput = activeOnly({
      companyId,
      isActive: true,
      ...exclusionFilter,
    });

    const scopes: Prisma.UserWhereInput[] = [];
    if (options?.crewSupervisorId) {
      scopes.push({ reportsToUserId: options.crewSupervisorId });
    } else {
      if (options?.includeSelf && allowed.includes('SELF')) {
        scopes.push({ id: actorUserId });
      }
      if (fullAccess) {
        scopes.push({ id: { not: actorUserId } });
      } else {
        if (allowed.includes('SUPERVISOR')) {
          scopes.push({ reportsToUserId: actorUserId });
        }
        if (allowed.includes('DELEGATE') && !limitedSiteAssignment) {
          const delegate = await this.delegateScopeWhere(actorUserId, companyId);
          if (delegate) {
            scopes.push({ AND: [{ id: { not: actorUserId } }, delegate] });
          }
        }
      }
    }
    if (scopes.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { AND: [base, { OR: scopes }] },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        reportsToUserId: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      department: user.department?.name ?? null,
      position: user.position?.title ?? null,
      initiatedAs:
        user.id === actorUserId
          ? RequestInitiatorType.SELF
          : user.reportsToUserId === actorUserId && allowed.includes('SUPERVISOR')
            ? RequestInitiatorType.SUPERVISOR
            : RequestInitiatorType.DELEGATE,
    }));
  }

  /**
   * Flight / business-trip passengers the actor may include: the same initiator
   * rules as filing the request (self if allowed, direct reports if SUPERVISOR,
   * delegate scope, or anyone for full-access roles). Approver-only accounts
   * stay selectable - passengers are not HR-process subjects.
   */
  async getSelectablePassengers(
    actorUserId: string,
    companyId: string,
    requestType: 'FLIGHT_APPLICATION' | 'BUSINESS_TRIP',
  ): Promise<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      name: string;
      position: string | null;
    }>
  > {
    const employees = await this.getInitiableEmployees(
      actorUserId,
      companyId,
      requestType,
      { includeSelf: true, includeApproverOnly: true },
    );
    return employees.map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      position: employee.position,
    }));
  }

  private async siteAssignmentLimitedToDirectReports(
    actorUserId: string,
    companyId: string,
    requestType: InitiatorRequestType,
  ): Promise<boolean> {
    if (requestType !== 'SITE_ASSIGNMENT') {
      return false;
    }
    const role = await this.hrApprovalChain.getPrimaryRoleName(actorUserId, companyId);
    return (
      role !== null &&
      SITE_ASSIGNMENT_DIRECT_REPORTS_ONLY_ROLES.includes(role)
    );
  }

  private async initiatorFor(
    actorUserId: string,
    employee: { id: string; reportsToUserId: string | null },
    companyId: string,
    allowed: readonly RequestInitiator[],
    requestType: InitiatorRequestType,
  ): Promise<RequestInitiatorType | null> {
    const limitedSiteAssignment = await this.siteAssignmentLimitedToDirectReports(
      actorUserId,
      companyId,
      requestType,
    );
    if (employee.reportsToUserId === actorUserId && allowed.includes('SUPERVISOR')) {
      return RequestInitiatorType.SUPERVISOR;
    }
    if (
      requestType === 'SITE_ASSIGNMENT' &&
      employee.reportsToUserId &&
      employee.reportsToUserId !== actorUserId
    ) {
      const supervisor = await this.prisma.user.findFirst({
        where: activeOnly({
          id: employee.reportsToUserId,
          companyId,
          isActive: true,
        }),
        select: {
          id: true,
          reportsToUserId: true,
          excludedFromHrProcesses: true,
        },
      });
      if (supervisor && isExcludedFromHrProcesses(supervisor)) {
        const forSupervisor = await this.initiatorFor(
          actorUserId,
          supervisor,
          companyId,
          allowed,
          requestType,
        );
        if (
          forSupervisor === RequestInitiatorType.SUPERVISOR ||
          forSupervisor === RequestInitiatorType.DELEGATE
        ) {
          return RequestInitiatorType.DELEGATE;
        }
      }
    }
    if (
      !limitedSiteAssignment &&
      (await this.hrApprovalChain.isHrOrFullAccessActor(actorUserId, companyId))
    ) {
      return RequestInitiatorType.DELEGATE;
    }
    if (allowed.includes('DELEGATE') && !limitedSiteAssignment) {
      const delegate = await this.delegateScopeWhere(actorUserId, companyId);
      if (delegate) {
        const match = await this.prisma.user.findFirst({
          where: { AND: [delegate, { id: employee.id }] },
          select: { id: true },
        });
        if (match) {
          return RequestInitiatorType.DELEGATE;
        }
      }
    }
    return null;
  }

  /**
   * Throws when the employee is an approver-only account (no HR processes of
   * their own) - used for self-submissions, which skip the on-behalf checks.
   */
  async assertTakesPartInHrProcesses(
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { excludedFromHrProcesses: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (isExcludedFromHrProcesses(employee)) {
      throw new BadRequestException(EXCLUDED_FROM_HR_MESSAGE);
    }
  }

  /**
   * Subject of an HR-process request (leave, overtime, field movement, site
   * assignment, WFH): the on-behalf target or the actor, and never an
   * approver-only account - including approver-only users filing for themselves.
   */
  async resolveHrProcessSubjectId(
    actorUserId: string,
    companyId: string,
    onBehalfOfEmployeeId?: string | null,
  ): Promise<string> {
    const employeeId = await this.resolveTargetEmployeeId(
      actorUserId,
      companyId,
      onBehalfOfEmployeeId,
    );
    await this.assertTakesPartInHrProcesses(employeeId, companyId);
    return employeeId;
  }

  /**
   * True when the actor owns the record, or filed it on the owner's behalf and
   * is still eligible to act for them (drafts: edit items, submit).
   */
  async canActForRecord(
    actorUserId: string,
    companyId: string,
    record: { employeeId: string; createdBy: string },
  ): Promise<boolean> {
    if (record.employeeId === actorUserId) {
      return true;
    }
    if (record.createdBy !== actorUserId) {
      return false;
    }
    return this.isEligibleFor(actorUserId, record.employeeId, companyId);
  }

  /**
   * Writes the CREATE_ON_BEHALF audit entry. No-op for self-submissions.
   * The stored `autoApproveTier` is read back at submit for draft-based modules.
   */
  async recordOnBehalfCreate(input: {
    moduleCode: HrOnBehalfModuleCode;
    companyId: string;
    actorUserId: string;
    employeeId: string;
    recordId: string;
    recordReference?: string;
    autoApproveTier?: boolean;
  }): Promise<void> {
    if (input.employeeId === input.actorUserId) {
      return;
    }
    const audit = MODULE_AUDIT[input.moduleCode];
    const people = await this.prisma.user.findMany({
      where: { id: { in: [input.actorUserId, input.employeeId] } },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    });
    const nameOf = (id: string): string | null => {
      const user = people.find((row) => row.id === id);
      return user
        ? [user.firstName, user.middleName, user.lastName]
            .filter((part) => Boolean(part && part.trim()))
            .join(' ')
        : null;
    };
    await this.auditService.create({
      userId: input.actorUserId,
      companyId: input.companyId,
      module: audit.module,
      action: CREATE_ON_BEHALF_ACTION,
      recordType: audit.recordType,
      recordId: input.recordId,
      recordReference: input.recordReference,
      afterValue: {
        createdBy: input.actorUserId,
        createdByName: nameOf(input.actorUserId),
        onBehalfOf: input.employeeId,
        onBehalfOfName: nameOf(input.employeeId),
        autoApproveTier:
          input.autoApproveTier === true &&
          isOnBehalfAutoApproveAllowed(input.moduleCode),
      },
    });
  }

  /**
   * autoApproveTier the actor chose when they filed this record on someone's behalf.
   */
  async wasAutoApproveRequested(
    moduleCode: HrOnBehalfModuleCode,
    recordId: string,
    actorUserId: string,
    companyId: string,
  ): Promise<boolean> {
    const entry = await this.prisma.auditLog.findFirst({
      where: {
        companyId,
        module: MODULE_AUDIT[moduleCode].module,
        action: CREATE_ON_BEHALF_ACTION,
        recordId,
        userId: actorUserId,
      },
      orderBy: { createdAt: 'desc' },
      select: { afterValue: true },
    });
    const after = entry?.afterValue as Prisma.JsonObject | null | undefined;
    return after?.autoApproveTier === true;
  }

  /**
   * After an on-behalf submission is linked to its approval request, approves the
   * creator's own tier when requested. Other tiers are untouched. Failures are logged,
   * never thrown - the request simply stays pending on the creator's tier.
   */
  async applyAutoApprove(input: {
    moduleCode: HrOnBehalfModuleCode;
    companyId: string;
    actorUserId: string;
    employeeId: string;
    approvalRequestId: string;
    autoApproveTier: boolean;
  }): Promise<void> {
    if (!input.autoApproveTier || input.employeeId === input.actorUserId) {
      return;
    }
    if (!isOnBehalfAutoApproveAllowed(input.moduleCode)) {
      this.logger.warn(
        `On-behalf auto-approve is not allowed for ${input.moduleCode} (approval ${input.approvalRequestId})`,
      );
      return;
    }
    try {
      const result = await this.approvalsService.autoApproveOwnTier(
        input.approvalRequestId,
        input.companyId,
        input.actorUserId,
        ON_BEHALF_AUTO_APPROVE_COMMENT,
      );
      if (!result) {
        return;
      }
      await this.auditService.create({
        userId: input.actorUserId,
        companyId: input.companyId,
        module: MODULE_AUDIT[input.moduleCode].module,
        action: AUTO_APPROVE_ACTION,
        recordType: 'ApprovalTier',
        recordId: result.tierId,
        afterValue: {
          approvedBy: input.actorUserId,
          reason: ON_BEHALF_AUTO_APPROVE_COMMENT,
          createdBy: input.actorUserId,
          employeeId: input.employeeId,
          approvalRequestId: input.approvalRequestId,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `On-behalf auto-approve failed for approval ${input.approvalRequestId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Prisma filter for the user's on-behalf targets, or null when they have none.
   */
  private async eligibleEmployeesWhere(
    userId: string,
    companyId: string,
  ): Promise<Prisma.UserWhereInput | null> {
    const base = activeOnly(
      hrProcessEmployeeWhere({
        companyId,
        isActive: true,
        id: { not: userId },
      }),
    );
    const scope = await this.delegateScopeWhere(userId, companyId);
    if (!scope) {
      return null;
    }
    return { ...base, ...scope };
  }

  /**
   * Delegate (on-behalf) scope only, without the active/company/self filters:
   * {} = anyone (hr.view or full-access role), department/discipline members
   * for leads, null = nobody.
   */
  private async delegateScopeWhere(
    userId: string,
    companyId: string,
  ): Promise<Prisma.UserWhereInput | null> {
    const [isHrViewer, isFullAccess] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId),
    ]);
    if (isHrViewer || isFullAccess) {
      return {};
    }

    const [ledDepartments, ledDisciplines] = await Promise.all([
      this.prisma.department.findMany({
        where: activeOnly({ companyId, leaderUserId: userId }),
        select: { id: true },
      }),
      this.prisma.discipline.findMany({
        where: activeOnly({ companyId, leaderId: userId }),
        select: { id: true },
      }),
    ]);

    const scopes: Prisma.UserWhereInput[] = [];
    if (ledDepartments.length > 0) {
      scopes.push({
        departmentId: { in: ledDepartments.map((d) => d.id) },
      });
    }
    if (ledDisciplines.length > 0) {
      scopes.push({
        engineeringDisciplineId: { in: ledDisciplines.map((d) => d.id) },
      });
    }
    if (scopes.length === 0) {
      return null;
    }
    return { OR: scopes };
  }
}
