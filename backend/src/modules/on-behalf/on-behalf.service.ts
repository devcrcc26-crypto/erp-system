import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionService } from '../../shared/permissions/permission.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { activeOnly } from '../../shared/prisma/soft-delete.util';
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
}

export const ON_BEHALF_AUTO_APPROVE_COMMENT =
  'Auto-approved by creator (on-behalf submission)';

const CREATE_ON_BEHALF_ACTION = 'CREATE_ON_BEHALF';
const AUTO_APPROVE_ACTION = 'ON_BEHALF_AUTO_APPROVE';

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
};

/**
 * "Submit on behalf of" rules shared by every HR request module.
 *
 * - HR (hr.view) and full-access roles: any active employee in the company.
 * - Department head (Department.leaderUserId): employees of the departments they lead.
 *   Departments are flat today; when sub-departments exist, extend `ledDepartmentIds`.
 * - Discipline lead (Discipline.leaderId): employees of the disciplines they lead.
 * - Everyone else: nobody. The actor is never eligible as their own on-behalf target.
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
  ): Promise<{ isInChain: boolean; tierLabel: string | null }> {
    const notInChain = { isInChain: false, tierLabel: null };
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
    return tier ? { isInChain: true, tierLabel: tier.label } : notInChain;
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
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!(await this.isEligibleFor(actorUserId, onBehalfOfEmployeeId, companyId))) {
      throw new ForbiddenException(
        'You do not have permission to submit on behalf of this employee',
      );
    }
    return onBehalfOfEmployeeId;
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
        onBehalfOf: input.employeeId,
        autoApproveTier: input.autoApproveTier === true,
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
   * never thrown — the request simply stays pending on the creator's tier.
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
    const base = activeOnly({
      companyId,
      isActive: true,
      id: { not: userId },
    });

    const [isHrViewer, isFullAccess] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId),
    ]);
    if (isHrViewer || isFullAccess) {
      return base;
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
    return { ...base, OR: scopes };
  }
}
