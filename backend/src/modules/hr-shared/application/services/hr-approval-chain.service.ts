import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  isVacantApprover,
  vacantApproverMessage,
} from '../../../../shared/employment/vacant-approver.util';
import type { ResolvedApprovalTier } from '../../../approvals/application/services/approval-resolver.service';
import {
  AUTO_APPROVE_FALLBACK_TIER_LABEL,
  getAutoApproveModeFromEnv,
} from '../../../../shared/config/auto-approve.mode';

interface ChainTierDraft {
  order: number;
  label: string;
  approverId: string;
  resolver: string;
  /** Present when this tier replaced a skipped tier. */
  skipNote?: string;
}

export interface SkippedTier {
  order: number;
  label: string;
  skipped: true;
  skipReason: string;
}

/** Roles that skip the Discipline Lead tier (already at or above that level). */
export const DISCIPLINE_LEAD_OR_ABOVE_ROLES: readonly string[] = [
  'Discipline Lead',
  'Department Head',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
  'HR Specialist',
  'HR Assistant',
  'General Manager',
  'Managing Director',
  'System Administrator',
];

/**
 * Roles that ARE the HR Manager tier
 * (their requests skip the HR Manager tier and go to GM).
 */
export const HR_MANAGER_ROLES: readonly string[] = [
  'HR Officer',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
];

/** Roles that skip the Department Head tier (already at or above that level). */
export const DEPARTMENT_HEAD_OR_ABOVE_ROLES: readonly string[] = [
  'Department Head',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
  'HR Specialist',
  'HR Assistant',
  'General Manager',
  'Managing Director',
  'System Administrator',
];

/** Roles that auto-approve (no approval chain needed). */
export const AUTO_APPROVE_ROLES: readonly string[] = [
  'General Manager',
  'Managing Director',
  'System Administrator',
];

/** HR staff roles - their org requests go directly to HR Manager. */
export const HR_STAFF_ROLES: readonly string[] = [
  'HR Assistant',
  'HR Specialist',
  'Local HR Manager',
];

/** Keep for backward compatibility - same as HR_MANAGER_ROLES. */
export const HR_OR_FULL_ACCESS_ROLES: readonly string[] = HR_MANAGER_ROLES;

/** Keep for backward compatibility - same as HR_MANAGER_ROLES. */
export const HR_APPROVER_ROLES: readonly string[] = HR_MANAGER_ROLES;

/** Roles that have HR module access (used for permission checks). */
export const HR_ACCESS_ROLES: readonly string[] = [
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
  'HR Specialist',
  'HR Assistant',
  'General Manager',
  'Managing Director',
  'System Administrator',
];

/** HR request modules that support on-behalf submission (approval category codes). */
export const HR_ON_BEHALF_MODULE_CODES = [
  'LEAVE_REQUEST',
  'EXPENSE_CLAIM',
  'PURCHASE_REQUEST',
  'MATERIAL_REQUISITION',
  'CONSUMABLES_REQUISITION',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
  'PER_DIEM',
  'VEHICLE_APPLICATION',
  'OFFICIAL_SEAL_USAGE',
  'PROJECT_SEAL_USAGE',
  'VEHICLE_REFUELING',
  'OVERTIME_APPLICATION',
  'FIELD_MOVEMENT_LOG',
  'INSPECTION_REPAIR',
  'EXIT_PERMIT',
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'ASSET_REQUEST',
] as const;

export type HrOnBehalfModuleCode = (typeof HR_ON_BEHALF_MODULE_CODES)[number];

export interface ExitPermitChainOptions {
  /**
   * When true, do not skip Reports to / HR Officer because the employee
   * occupies that tier. On-behalf filings still require those people to approve.
   */
  submittedOnBehalf?: boolean;
}

/**
 * Builds Reports-to → Department Head → HR Manager / GM chains
 * for HR workflows (leave, overtime, flight, etc.).
 * Standard employees use Reports to (required) instead of Discipline Lead.
 * Role-based tiers resolve only users whose matching role is marked isPrimary.
 */
@Injectable()
export class HrApprovalChainService {
  private readonly logger = new Logger(HrApprovalChainService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * In AUTO_APPROVE_ALL local mode, empty or failed chains become a single
   * "Test auto-approval" tier so submissions are never blocked.
   */
  private async withAutoApproveFallback(
    build: () => Promise<ResolvedApprovalTier[]>,
  ): Promise<ResolvedApprovalTier[]> {
    const mode = getAutoApproveModeFromEnv();
    if (!mode.active) {
      return build();
    }
    try {
      const tiers = await build();
      if (tiers.length === 0) {
        return [this.buildTestAutoApproveTier(mode.actorId)];
      }
      return tiers;
    } catch (error: unknown) {
      this.logger.warn(
        `AUTO_APPROVE_ALL: chain resolution failed, using fallback tier: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [this.buildTestAutoApproveTier(mode.actorId)];
    }
  }

  private buildTestAutoApproveTier(actorId: string): ResolvedApprovalTier {
    return {
      tierOrder: 1,
      label: AUTO_APPROVE_FALLBACK_TIER_LABEL,
      approverId: actorId,
      resolver: 'AUTO_APPROVE_FALLBACK',
    };
  }


  /**
   * Approval chain for purchase requests — single General Manager tier (always).
   */
  async buildPurchaseApprovalChain(
    _submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildPurchaseApprovalChain
    return this.withAutoApproveFallback(async () => {
      const gm = await this.getGeneralManager(companyId);
      return [
        {
          tierOrder: 1,
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
      ];
    });
  }

  /**
   * Exit permit chain for the **employee** the permit belongs to.
   * Self-submit: Reports to and HR Officer skip themselves (HR+ auto-approves).
   * On-behalf: those tiers still run, even if the employee occupies them.
   */
  async buildExitPermitApprovalChain(
    employeeId: string,
    companyId: string,
    options?: ExitPermitChainOptions,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildExitPermitApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submittedOnBehalf = options?.submittedOnBehalf === true;

    if (submittedOnBehalf) {
      return this.buildOnBehalfExitPermitChain(employeeId, companyId);
    }

    const primaryRole =
      (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const isHrOrAbove = HR_OR_FULL_ACCESS_ROLES.includes(primaryRole);

    const isDisciplineLeadOrAbove =
      [
        'Discipline Lead',
        'Department Head',
        ...HR_OR_FULL_ACCESS_ROLES,
      ].includes(primaryRole) || employee.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const reportsTo = await this.getReportsToRequired(employeeId, companyId);

      tiers.push({
        order: 1,
        label: 'Reports to',
        approverId: reportsTo.id,
        resolver: 'REPORTS_TO',
      });
    }

    if (!isHrOrAbove) {
      const hrOfficer = await this.getHROfficer(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Officer',
        approverId: hrOfficer.id,
        resolver: 'ROLE:HR Officer',
      });
    }

    return this.finalizeTiers(tiers);
  
    });
  }

  /**
   * Single-tier first-approver chain (used by per diem advances).
   * Standard employee → Reports to (required; blocks if unset).
   * Discipline Lead owner → Department Head if assigned, else HR Manager.
   * Department Head / HR staff / HR Manager → first tier of the org chain (GM or HR Manager).
   * Skips a candidate when they are the subject (no self-approval).
   * GM / Managing Director / System Administrator → empty chain (auto-approve).
   * Site assignment uses {@link buildSiteAssignmentApprovalChain} instead.
   */
  async buildDisciplineLeadSingleTierChain(
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildDisciplineLeadSingleTierChain
    return this.withAutoApproveFallback(async () => {

    const primaryRole =
      (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    if (AUTO_APPROVE_ROLES.includes(primaryRole)) {
      return [];
    }

    const isHrManagerTier = HR_MANAGER_ROLES.includes(primaryRole);
    const isHrStaff = HR_STAFF_ROLES.includes(primaryRole);
    const isDepartmentHead = primaryRole === 'Department Head';
    const isDisciplineLeadByRole = primaryRole === 'Discipline Lead';
    const isDisciplineLeadByData = employee.ledDisciplines.length > 0;
    const isDisciplineLead = isDisciplineLeadByRole || isDisciplineLeadByData;

    type Candidate = {
      label: string;
      approverId: string;
      resolver: string;
    };

    const pickSingle = async (
      candidates: Array<Candidate | null>,
    ): Promise<ResolvedApprovalTier[]> => {
      for (const candidate of candidates) {
        if (!candidate) {
          continue;
        }
        if (candidate.approverId === employeeId) {
          continue;
        }
        return this.finalizeTiers([
          {
            order: 1,
            label: candidate.label,
            approverId: candidate.approverId,
            resolver: candidate.resolver,
          },
        ]);
      }
      return [];
    };

    if (isHrManagerTier) {
      const gm = await this.getGeneralManager(companyId);
      return pickSingle([
        {
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
      ]);
    }

    if (isHrStaff) {
      const hrManager = await this.getHRManager(companyId);
      return pickSingle([
        {
          label: 'HR Manager',
          approverId: hrManager.id,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    }

    if (isDepartmentHead) {
      const gm = await this.getGeneralManager(companyId);
      const hrManager = await this.getHRManager(companyId);
      return pickSingle([
        {
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
        {
          label: 'HR Manager',
          approverId: hrManager.id,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    }

    if (isDisciplineLead) {
      const deptHead = await this.getDepartmentHead(employeeId, companyId);
      const hrManager = await this.getHRManager(companyId);
      return pickSingle([
        deptHead.found
          ? {
              label: 'Department Head',
              approverId: deptHead.id,
              resolver: 'ROLE:Department Head',
            }
          : null,
        {
          label: 'HR Manager',
          approverId: hrManager.id,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    }

    const reportsTo = await this.getReportsToRequired(employeeId, companyId);
    return pickSingle([
      {
        label: 'Reports to',
        approverId: reportsTo.id,
        resolver: 'REPORTS_TO',
      },
    ]);
  
    });
  }

  /**
   * Site assignment: Employee → Reports to only.
   * No Department Head / HR Manager / GM fallbacks.
   * GM / Managing Director / System Administrator → HR Manager (never an empty
   * chain).
   * Missing Reports to → HR Manager fallback (approver-only / unassigned subjects).
   */
  async buildSiteAssignmentApprovalChain(
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildSiteAssignmentApprovalChain
    return this.withAutoApproveFallback(() =>
      this.buildReportsToOnlyChain(employeeId, companyId, 'HR_MANAGER'),
    );
  }

  /**
   * Work from home: Employee → Reports to (tier 1) → HR Officer (tier 2).
   * GM / Managing Director / System Administrator → empty chain (auto-approve).
   * Missing Reports to → BadRequestException.
   */
  async buildWorkFromHomeApprovalChain(
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildWorkFromHomeApprovalChain
    return this.withAutoApproveFallback(async () => {
      const primaryRole =
        (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

      if (AUTO_APPROVE_ROLES.includes(primaryRole)) {
        return [];
      }

      let reportsTo: { id: string };
      try {
        reportsTo = await this.getReportsToRequired(employeeId, companyId);
      } catch {
        throw new BadRequestException(
          'No direct supervisor assigned — contact HR',
        );
      }

      const hrOfficer = await this.getHROfficer(companyId);

      return this.finalizeTiers([
        {
          order: 1,
          label: 'Reports to',
          approverId: reportsTo.id,
          resolver: 'REPORTS_TO',
        },
        {
          order: 2,
          label: 'HR Officer',
          approverId: hrOfficer.id,
          resolver: 'ROLE:HR Officer',
        },
      ]);
    });
  }

  /**
   * Supervisor-filed requests: the chain starts above the submitter. Every tier
   * the submitter would hold goes to the submitter's own Reports to, or the HR
   * Manager when they have none (General Manager if the HR Manager is the
   * submitter). The submitter never approves their own filing.
   */
  async startChainAboveSubmitter(
    tiers: ResolvedApprovalTier[],
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    if (!tiers.some((tier) => tier.approverId === submitterId)) {
      return tiers;
    }
    const replacement = await this.approverAboveSubmitter(submitterId, companyId);
    return this.finalizeTiers(
      tiers.map((tier) =>
        tier.approverId === submitterId
          ? { order: tier.tierOrder, ...replacement }
          : {
              order: tier.tierOrder,
              label: tier.label,
              approverId: tier.approverId,
              resolver: tier.resolver,
            },
      ),
    );
  }

  private async approverAboveSubmitter(
    submitterId: string,
    companyId: string,
  ): Promise<{ label: string; approverId: string; resolver: string }> {
    const submitter = await this.prisma.user.findFirst({
      where: activeOnly({ id: submitterId, companyId }),
      select: {
        reportsTo: {
          select: { id: true, isActive: true, deletedAt: true },
        },
      },
    });
    const above = submitter?.reportsTo;
    if (above && above.isActive && !above.deletedAt && above.id !== submitterId) {
      return {
        label: "Submitter's Reports to",
        approverId: above.id,
        resolver: 'SUBMITTER_REPORTS_TO',
      };
    }
    const hrManager = await this.getHRManager(companyId);
    if (hrManager.id !== submitterId) {
      return { label: 'HR Manager', approverId: hrManager.id, resolver: 'ROLE:HR Manager' };
    }
    const gm = await this.getGeneralManager(companyId);
    return { label: 'General Manager', approverId: gm.id, resolver: 'ROLE:General Manager' };
  }

  private async buildReportsToOnlyChain(
    employeeId: string,
    companyId: string,
    executives: 'AUTO_APPROVE' | 'HR_MANAGER',
  ): Promise<ResolvedApprovalTier[]> {
    const primaryRole =
      (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

    if (AUTO_APPROVE_ROLES.includes(primaryRole)) {
      if (executives === 'AUTO_APPROVE') {
        return [];
      }
      const hrManager = await this.getHRManager(companyId);
      return this.finalizeTiers([
        {
          order: 1,
          label: 'HR Manager',
          approverId: hrManager.id,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    }

    try {
      const reportsTo = await this.getReportsToRequired(employeeId, companyId);
      return this.finalizeTiers([
        {
          order: 1,
          label: 'Reports to',
          approverId: reportsTo.id,
          resolver: 'REPORTS_TO',
        },
      ]);
    } catch (error: unknown) {
      // Site assignment (HR_MANAGER executives): subjects with no Reports to
      // (common for approver-only accounts) still need a real approver tier.
      if (executives !== 'HR_MANAGER' || !(error instanceof BadRequestException)) {
        throw error;
      }
      const hrManager = await this.getHRManager(companyId);
      return this.finalizeTiers([
        {
          order: 1,
          label: 'HR Manager',
          approverId: hrManager.id,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    }
  }

  /**
   * Per diem settlement: single HR tier.
   * Prefer HR Manager; Local HR Manager is the alternate (and vice versa when the
   * submitter holds one of those roles). If neither is available → General Manager.
   */
  async buildPerDiemSettlementApprovalChain(
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildPerDiemSettlementApprovalChain
    return this.withAutoApproveFallback(async () => {

    const primaryRole =
      (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

    if (AUTO_APPROVE_ROLES.includes(primaryRole)) {
      return [];
    }

    const hrManager = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'HR Manager',
    );
    const localHr = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'Local HR Manager',
    );
    const gm = await this.getGeneralManager(companyId);

    type Candidate = {
      label: string;
      approverId: string;
      resolver: string;
    };

    const candidates: Array<Candidate | null> = [];

    if (primaryRole === 'HR Manager') {
      candidates.push(
        localHr
          ? {
              label: 'Local HR Manager',
              approverId: localHr.id,
              resolver: 'ROLE:Local HR Manager',
            }
          : null,
        {
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
      );
    } else if (primaryRole === 'Local HR Manager') {
      candidates.push(
        hrManager
          ? {
              label: 'HR Manager',
              approverId: hrManager.id,
              resolver: 'ROLE:HR Manager',
            }
          : null,
        {
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
      );
    } else {
      candidates.push(
        hrManager
          ? {
              label: 'HR Manager',
              approverId: hrManager.id,
              resolver: 'ROLE:HR Manager',
            }
          : null,
        localHr
          ? {
              label: 'Local HR Manager',
              approverId: localHr.id,
              resolver: 'ROLE:Local HR Manager',
            }
          : null,
        {
          label: 'General Manager',
          approverId: gm.id,
          resolver: 'ROLE:General Manager',
        },
      );
    }

    for (const candidate of candidates) {
      if (!candidate || candidate.approverId === employeeId) {
        continue;
      }
      return this.finalizeTiers([
        {
          order: 1,
          label: candidate.label,
          approverId: candidate.approverId,
          resolver: candidate.resolver,
        },
      ]);
    }

    throw new BadRequestException(
      'No HR Manager, Local HR Manager, or General Manager available to approve this settlement',
    );
  
    });
  }

  async buildChainForModule(
    moduleCode: HrOnBehalfModuleCode,
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    switch (moduleCode) {
      case 'SITE_ASSIGNMENT':
        return this.buildSiteAssignmentApprovalChain(employeeId, companyId);
      case 'WORK_FROM_HOME':
        return this.buildWorkFromHomeApprovalChain(employeeId, companyId);

      case 'LEAVE_REQUEST':
      case 'OVERTIME_APPLICATION':
      case 'FIELD_MOVEMENT_LOG':
        return this.buildOrgApprovalChain(employeeId, companyId, false);

      case 'EXIT_PERMIT':
        // Only membership checks (on-behalf: actor ≠ employee) reach here, and
        // ExitPermitService builds on-behalf permits with submittedOnBehalf.
        return this.buildExitPermitApprovalChain(employeeId, companyId, {
          submittedOnBehalf: true,
        });

      case 'EXPENSE_CLAIM':
        return this.buildOrgApprovalChain(employeeId, companyId, true);

      case 'PER_DIEM':
        return this.buildDisciplineLeadSingleTierChain(employeeId, companyId);

      case 'PURCHASE_REQUEST':
        return this.buildPurchaseApprovalChain(employeeId, companyId);

      case 'MATERIAL_REQUISITION':
        return this.buildMaterialRequisitionApprovalChain(employeeId, companyId);

      case 'CONSUMABLES_REQUISITION':
        return this.buildConsumablesApprovalChain(employeeId, companyId);

      case 'FLIGHT_APPLICATION':
      case 'BUSINESS_TRIP':
        return this.buildFlightApprovalChain(employeeId, companyId);

      case 'VEHICLE_APPLICATION':
        return this.buildVehicleApplicationApprovalChain(employeeId, companyId);

      case 'VEHICLE_REFUELING':
        return this.buildVehicleRefuelingApprovalChain(employeeId, companyId);

      case 'OFFICIAL_SEAL_USAGE':
        return this.buildOfficialSealApprovalChain(employeeId, companyId);

      case 'PROJECT_SEAL_USAGE':
        return this.buildProjectSealApprovalChain(employeeId, companyId);

      case 'INSPECTION_REPAIR':
        return [];

      case 'ASSET_REQUEST':
        return this.buildMaterialRequisitionApprovalChain(employeeId, companyId);
    }
  }

  /**
   * First tier in the module chain for `employeeId` assigned to `userId`, or null.
   * Chain resolution errors (e.g. no discipline lead) count as "not in chain".
   */
  async findUserTierInModuleChain(
    userId: string,
    moduleCode: HrOnBehalfModuleCode,
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier | null> {
    try {
      const tiers = await this.buildChainForModule(
        moduleCode,
        employeeId,
        companyId,
      );
      return tiers.find((tier) => tier.approverId === userId) ?? null;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return null;
      }
      throw error;
    }
  }

  /**
   * True when the user may file HR documents for another employee.
   */
  async isHrOrFullAccessActor(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const primaryRole = await this.getPrimaryRoleName(userId, companyId);
    return primaryRole !== null && HR_OR_FULL_ACCESS_ROLES.includes(primaryRole);
  }

  /**
   * On-behalf filings always require Reports to and HR Officer,
   * including when that approver is the employee the permit is for.
   */
  private async buildOnBehalfExitPermitChain(
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const tiers: ChainTierDraft[] = [];

    const reportsTo = await this.getReportsToRequired(employeeId, companyId);
    tiers.push({
      order: 1,
      label: 'Reports to',
      approverId: reportsTo.id,
      resolver: 'REPORTS_TO',
    });

    const hrOfficer = await this.getHROfficer(companyId);
    tiers.push({
      order: tiers.length + 1,
      label: 'HR Officer',
      approverId: hrOfficer.id,
      resolver: 'ROLE:HR Officer',
    });

    return this.finalizeTiers(tiers);
  }

  private finalizeTiers(tiers: ChainTierDraft[]): ResolvedApprovalTier[] {
    const uniqueTiers = tiers.filter(
      (tier, index, self) =>
        index === self.findIndex((t) => t.approverId === tier.approverId),
    );

    return uniqueTiers.map((tier, index) => ({
      tierOrder: index + 1,
      label: tier.label,
      approverId: tier.approverId,
      resolver: tier.resolver,
    }));
  }

  /**
   * Approval chain for material requisitions.
   * Employee → Reports to → HR Officer → General Manager.
   * HR Officer / above skip Reports to (and HR self-approval).
   * Empty array = auto-approve (GM+ submitter).
   */
  async buildMaterialRequisitionApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildMaterialRequisitionApprovalChain
    return this.withAutoApproveFallback(async () => {

    const primaryRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const submitter = await this.prisma.user.findFirst({
      where: activeOnly({ id: submitterId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!submitter) {
      throw new BadRequestException('Employee not found');
    }

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(primaryRole);

    const isGmOrAbove = [
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(primaryRole);

    const isDisciplineLeadOrAbove =
      [
        'Discipline Lead',
        'Department Head',
        'HR Officer',
        'HR Manager',
        'General Manager',
        'Managing Director',
        'System Administrator',
      ].includes(primaryRole) || submitter.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const reportsTo = await this.getReportsToRequired(submitterId, companyId);
      tiers.push({
        order: 1,
        label: 'Reports to',
        approverId: reportsTo.id,
        resolver: 'REPORTS_TO',
      });
    }

    if (!isHrOrAbove) {
      const hrOfficer = await this.getHROfficer(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Officer',
        approverId: hrOfficer.id,
        resolver: 'ROLE:HR Officer',
      });
    }

    if (!isGmOrAbove) {
      const gm = await this.getGeneralManager(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
    }

    const uniqueTiers = tiers.filter(
      (tier, index, self) =>
        index === self.findIndex((t) => t.approverId === tier.approverId),
    );

    return uniqueTiers.map((tier, index) => ({
      tierOrder: index + 1,
      label: tier.label,
      approverId: tier.approverId,
      resolver: tier.resolver,
    }));
  
    });
  }

  /**
   * Approval chain for consumables requisitions.
   * Empty array = HR Officer / above - direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildConsumablesApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildConsumablesApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submitterRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(submitterRole);

    if (isHrOrAbove) {
      return [];
    }

    const hr = await this.getHROfficer(companyId);
    return [
      {
        tierOrder: 1,
        label: 'HR Officer',
        approverId: hr.id,
        resolver: 'ROLE:HR Officer',
      },
    ];
  
    });
  }

  /**
   * Approval chain for vehicle applications.
   * Empty array = HR Officer / above - direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildVehicleApplicationApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildVehicleApplicationApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submitterRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(submitterRole);

    if (isHrOrAbove) {
      return [];
    }

    const hr = await this.getHROfficer(companyId);
    return [
      {
        tierOrder: 1,
        label: 'HR Officer',
        approverId: hr.id,
        resolver: 'ROLE:HR Officer',
      },
    ];
  
    });
  }

  /**
   * Approval chain for vehicle refueling requests.
   * Empty array = HR Officer / above - direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildVehicleRefuelingApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildVehicleRefuelingApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submitterRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(submitterRole);

    if (isHrOrAbove) {
      return [];
    }

    const hr = await this.getHROfficer(companyId);
    return [
      {
        tierOrder: 1,
        label: 'HR Officer',
        approverId: hr.id,
        resolver: 'ROLE:HR Officer',
      },
    ];
  
    });
  }

  /**
 * Approval chain for official seal requests.
 * Empty array = General Manager / above - direct APPROVED (no approval request).
 * if HR Officer / above, a single HR Officer tier. Then a General Manager tier.
 * Otherwise a single HR Officer and General Manager tier.
 */

  async buildOfficialSealApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildOfficialSealApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submitterRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const isGmOrAbove = [
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(submitterRole);

    if (isGmOrAbove) {
      return [];
    }

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager'
    ].includes(submitterRole);

    const tiers: ChainTierDraft[] = [];
    const hr = await this.getHROfficer(companyId);
    const gm = await this.getGeneralManager(companyId);
    if (!isHrOrAbove) {
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Officer',
        approverId: hr.id,
        resolver: 'ROLE:HR Officer',
      });
    }
    tiers.push({
      order: tiers.length + 1,
      label: 'General Manager',
      approverId: gm.id,
      resolver: 'ROLE:General Manager',
    });

    const uniqueTiers = tiers.filter(
      (tier, index, self) =>
        index === self.findIndex((t) => t.approverId === tier.approverId),
    );

    return uniqueTiers.map((tier, index) => ({
      tierOrder: index + 1,
      label: tier.label,
      approverId: tier.approverId,
      resolver: tier.resolver,
    }));

  
    });
  }

  async buildProjectSealApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildProjectSealApprovalChain
    return this.withAutoApproveFallback(async () => {

    const submitterRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const isGmOrAbove = [
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(submitterRole);
    
    if (isGmOrAbove) {
      return [];
    }

    const isHrOrAbove = [
      'HR Officer',
      'HR Manager'
    ].includes(submitterRole);

    const tiers: ChainTierDraft[] = [];
    const hr = await this.getHROfficer(companyId);
    const gm = await this.getGeneralManager(companyId);
    if (!isHrOrAbove) {
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Officer',
        approverId: hr.id,
        resolver: 'ROLE:HR Officer',
      });
    }
    tiers.push({
      order: tiers.length + 1,
      label: 'General Manager',
      approverId: gm.id,
      resolver: 'ROLE:General Manager',
    });

    const uniqueTiers = tiers.filter(
      (tier, index, self) =>
        index === self.findIndex((t) => t.approverId === tier.approverId),
    );

    return uniqueTiers.map((tier, index) => ({
      tierOrder: index + 1,
      label: tier.label,
      approverId: tier.approverId,
      resolver: tier.resolver,
    }));

  
    });
  }
  /**
   * Field movement / early departure: same chain as leave (Reports to → HR).
   */
  async buildFieldMovementApprovalChain(
    userId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildFieldMovementApprovalChain
    return this.withAutoApproveFallback(async () => {

    return this.buildOrgApprovalChain(userId, companyId, false);
  
    });
  }

  /**
   * Org-structure approval chain with role-based routing.
   * Standard: Reports to (required) → HR Manager.
   * Discipline Lead: Department Head (optional) → HR Manager.
   * Department Head: GM → HR Manager.
   * HR staff: HR Manager.
   * HR Manager: GM.
   * GM+: auto-approve (empty).
   * @param includeGeneralManager Kept for callers; routing is role-based.
   */
  async buildOrgApprovalChain(
    employeeId: string,
    companyId: string,
    _includeGeneralManager: boolean,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildOrgApprovalChain
    return this.withAutoApproveFallback(async () => {

    void _includeGeneralManager;

    const primaryRole =
      (await this.getPrimaryRoleName(employeeId, companyId)) ?? '';

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const isAutoApprove = AUTO_APPROVE_ROLES.includes(primaryRole);
    if (isAutoApprove) {
      return [];
    }

    const isHrManager = HR_MANAGER_ROLES.includes(primaryRole);
    const isHrStaff = HR_STAFF_ROLES.includes(primaryRole);
    const isDisciplineLeadByRole = primaryRole === 'Discipline Lead';
    const isDisciplineLeadByData = employee.ledDisciplines.length > 0;
    const isDisciplineLead = isDisciplineLeadByRole || isDisciplineLeadByData;
    const isDepartmentHead = primaryRole === 'Department Head';

    const tiers: ChainTierDraft[] = [];

    if (isHrManager) {
      // HR Manager → GM → done
      const gm = await this.getGeneralManager(companyId);
      tiers.push({
        order: 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
      return this.finalizeTiers(tiers);
    }

    if (isHrStaff) {
      // HR staff → HR Manager → done
      const hrManager = await this.getHRManager(companyId);
      tiers.push({
        order: 1,
        label: 'HR Manager',
        approverId: hrManager.id,
        resolver: 'ROLE:HR Manager',
      });
      return this.finalizeTiers(tiers);
    }

    if (isDepartmentHead) {
      // Department Head → GM → HR Manager
      const gm = await this.getGeneralManager(companyId);
      tiers.push({
        order: 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
      const hrManager = await this.getHRManager(companyId);
      tiers.push({
        order: 2,
        label: 'HR Manager',
        approverId: hrManager.id,
        resolver: 'ROLE:HR Manager',
      });
      return this.finalizeTiers(tiers);
    }

    if (isDisciplineLead) {
      // Discipline Lead → Department Head (if assigned) → HR Manager
      const deptHead = await this.getDepartmentHead(employeeId, companyId);
      if (deptHead.found) {
        tiers.push({
          order: tiers.length + 1,
          label: 'Department Head',
          approverId: deptHead.id,
          resolver: 'ROLE:Department Head',
        });
      } else {
        this.logger.warn(
          `[ApprovalChain] Department Head tier skipped for ${employeeId}: ${deptHead.reason}`,
        );
      }

      const hrManager = await this.getHRManager(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Manager',
        approverId: hrManager.id,
        resolver: 'ROLE:HR Manager',
      });
      return this.finalizeTiers(tiers);
    }

    // Standard employee → Reports to (required) → HR Manager
    const reportsTo = await this.getReportsToRequired(employeeId, companyId);
    tiers.push({
      order: 1,
      label: 'Reports to',
      approverId: reportsTo.id,
      resolver: 'REPORTS_TO',
    });

    const hrManager = await this.getHRManager(companyId);
    tiers.push({
      order: tiers.length + 1,
      label: 'HR Manager',
      approverId: hrManager.id,
      resolver: 'ROLE:HR Manager',
    });

    return this.finalizeTiers(tiers);
  
    });
  }

  /**
   * Returns the employee's primary role name, or null if unset.
   */
  async getPrimaryRoleName(
    userId: string,
    companyId: string,
  ): Promise<string | null> {
    const assignment = await this.prisma.userRole.findFirst({
      where: activeOnly({
        userId,
        isPrimary: true,
        role: activeOnly({ companyId }),
      }),
      include: { role: { select: { name: true } } },
    });
    return assignment?.role.name ?? null;
  }

  /**
   * Resolves the employee's Reports-to supervisor for first-tier approval.
   * Blocks when unset, vacant/inactive, or self-referential.
   */
  async getReportsToRequired(
    employeeId: string,
    companyId: string,
  ): Promise<{ id: string }> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: {
        id: true,
        reportsToUserId: true,
        reportsTo: {
          select: {
            id: true,
            deletedAt: true,
            isActive: true,
            employmentStatus: true,
          },
        },
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    if (!employee.reportsToUserId || !employee.reportsTo) {
      throw new BadRequestException(
        'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
      );
    }

    if (isVacantApprover(employee.reportsTo)) {
      throw new BadRequestException(vacantApproverMessage('Reports to'));
    }

    if (employee.reportsTo.id === employeeId) {
      throw new BadRequestException(
        'Employee cannot report to themselves - ask HR to correct Reports to.',
      );
    }

    return { id: employee.reportsTo.id };
  }

  /**
   * Resolves the discipline lead for an employee's engineering discipline.
   * Kept for project-management and legacy callers; HR request chains use
   * {@link getReportsToRequired} instead.
   */
  async getDisciplineLead(
    employeeId: string,
    companyId: string,
  ): Promise<{ id: string }> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        engineeringDiscipline: {
          include: {
            leader: {
              select: { id: true, deletedAt: true, isActive: true, employmentStatus: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    if (!employee.engineeringDiscipline) {
      throw new BadRequestException(
        'Employee is not assigned to an engineering discipline.',
      );
    }

    const disciplineLeader = employee.engineeringDiscipline.leader;
    if (disciplineLeader && isVacantApprover(disciplineLeader)) {
      throw new BadRequestException(vacantApproverMessage('Discipline Lead'));
    }
    if (!disciplineLeader) {
      throw new BadRequestException(
        "No discipline leader assigned for this employee's discipline.",
      );
    }

    return { id: disciplineLeader.id };
  }

  /**
   * Soft-fail discipline lead lookup - skips the tier instead of throwing.
   */
  async getDisciplineLeadSafe(
    employeeId: string,
    companyId: string,
  ): Promise<{ id: string; found: true } | { found: false; reason: string }> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        engineeringDiscipline: {
          include: {
            leader: {
              select: { id: true, deletedAt: true, isActive: true, employmentStatus: true },
            },
          },
        },
      },
    });

    if (!employee) {
      return { found: false, reason: 'Employee not found' };
    }

    if (!employee.engineeringDiscipline) {
      return {
        found: false,
        reason: 'Employee is not assigned to an engineering discipline',
      };
    }

    const leader = employee.engineeringDiscipline.leader;
    // An assigned lead who left or is inactive is a vacancy, not a tier to skip.
    if (leader && isVacantApprover(leader)) {
      throw new BadRequestException(vacantApproverMessage('Discipline Lead'));
    }
    if (!leader) {
      return {
        found: false,
        reason: `No Discipline Lead assigned for ${employee.engineeringDiscipline.name}`,
      };
    }

    // Discipline Lead cannot approve their own request
    if (leader.id === employeeId) {
      return {
        found: false,
        reason: 'Employee is the Discipline Lead of their own discipline',
      };
    }

    return { found: true, id: leader.id };
  }

  /**
   * Resolves the department head (Department.leaderUser) for an employee.
   */
  async getDepartmentHead(
    employeeId: string,
    companyId: string,
  ): Promise<{ id: string; found: true } | { found: false; reason: string }> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      include: {
        department: {
          select: {
            id: true,
            name: true,
            leaderUserId: true,
            leaderUser: {
              select: { id: true, deletedAt: true, isActive: true, employmentStatus: true },
            },
          },
        },
      },
    });

    if (!employee) {
      return { found: false, reason: 'Employee not found' };
    }

    if (!employee.department) {
      return { found: false, reason: 'Employee is not assigned to a department' };
    }

    if (employee.department.leaderUser && isVacantApprover(employee.department.leaderUser)) {
      throw new BadRequestException(vacantApproverMessage('Department Head'));
    }
    if (!employee.department.leaderUserId || !employee.department.leaderUser) {
      return {
        found: false,
        reason: `No Department Head assigned for ${employee.department.name}`,
      };
    }

    // Department Head cannot approve their own request
    if (employee.department.leaderUserId === employeeId) {
      return {
        found: false,
        reason: 'Employee is the Department Head of their own department',
      };
    }

    return { found: true, id: employee.department.leaderUser.id };
  }

  /**
   * Resolves the company HR Manager (primary role), falling back to HR Officer.
   */
  async getHRManager(companyId: string): Promise<{ id: string }> {
    const hrManager = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'HR Manager',
    );
    if (hrManager) {
      return hrManager;
    }

    const hrOfficer = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'HR Officer',
    );
    if (hrOfficer) {
      return hrOfficer;
    }

    throw new BadRequestException(vacantApproverMessage('HR Manager'));
  }

  /**
   * Resolves the company HR Manager (primary role), falling back to HR Officer.
   * @deprecated Prefer {@link getHRManager}.
   */
  async getHROfficer(companyId: string): Promise<{ id: string }> {
    return this.getHRManager(companyId);
  }

  /**
   * All active users whose primary role matches the given name.
   */
  async findActiveUsersByPrimaryRoleName(
    companyId: string,
    roleName: string,
  ): Promise<Array<{ id: string }>> {
    return this.prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        employmentStatus: 'ACTIVE' as const,
        userRoles: {
          some: activeOnly({
            isPrimary: true,
            role: activeOnly({
              companyId,
              name: roleName,
            }),
          }),
        },
      }),
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Resolves the company General Manager (primary role).
   */
  async getGeneralManager(companyId: string): Promise<{ id: string }> {
    const gm = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'General Manager',
    );
    if (!gm) {
      throw new BadRequestException(vacantApproverMessage('General Manager'));
    }
    return gm;
  }

  /**
   * Flight / business-trip approval chain.
   * Standard: Reports to (required) → GM → HR Manager.
   * Discipline Lead: Department Head (optional) → GM → HR Manager.
   * Department Head / HR staff: GM → HR Manager.
   * HR Manager: GM.
   * GM+: auto-approve (empty).
   */
  async buildFlightApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    // AUTO_APPROVE_WRAP:buildFlightApprovalChain
    return this.withAutoApproveFallback(async () => {

    const primaryRole =
      (await this.getPrimaryRoleName(submitterId, companyId)) ?? '';

    const submitter = await this.prisma.user.findFirst({
      where: activeOnly({ id: submitterId, companyId }),
      include: {
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!submitter) {
      throw new BadRequestException('Submitter not found');
    }

    const isAutoApprove = AUTO_APPROVE_ROLES.includes(primaryRole);
    if (isAutoApprove) {
      return [];
    }

    const isHrManager = HR_MANAGER_ROLES.includes(primaryRole);
    const isHrStaff = HR_STAFF_ROLES.includes(primaryRole);
    const isDisciplineLeadByRole = primaryRole === 'Discipline Lead';
    const isDisciplineLeadByData = submitter.ledDisciplines.length > 0;
    const isDisciplineLead = isDisciplineLeadByRole || isDisciplineLeadByData;
    const isDepartmentHead = primaryRole === 'Department Head';

    const tiers: ChainTierDraft[] = [];

    const gm = await this.getGeneralManager(companyId);
    const hrManager = await this.getHRManager(companyId);

    if (isHrManager) {
      // HR Manager → GM → done
      tiers.push({
        order: 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
      return this.finalizeTiers(tiers);
    }

    if (isHrStaff || isDepartmentHead) {
      // HR staff / Department Head → GM → HR Manager
      tiers.push({
        order: 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
      tiers.push({
        order: 2,
        label: 'HR Manager',
        approverId: hrManager.id,
        resolver: 'ROLE:HR Manager',
      });
      return this.finalizeTiers(tiers);
    }

    if (isDisciplineLead) {
      // Discipline Lead → Department Head (if assigned) → GM → HR Manager
      const deptHead = await this.getDepartmentHead(submitterId, companyId);
      if (deptHead.found) {
        tiers.push({
          order: tiers.length + 1,
          label: 'Department Head',
          approverId: deptHead.id,
          resolver: 'ROLE:Department Head',
        });
      } else {
        this.logger.warn(
          `[ApprovalChain] Department Head tier skipped for ${submitterId}: ${deptHead.reason}`,
        );
      }
      tiers.push({
        order: tiers.length + 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Manager',
        approverId: hrManager.id,
        resolver: 'ROLE:HR Manager',
      });
      return this.finalizeTiers(tiers);
    }

    // Standard employee → Reports to (required) → GM → HR Manager
    const reportsTo = await this.getReportsToRequired(submitterId, companyId);
    tiers.push({
      order: tiers.length + 1,
      label: 'Reports to',
      approverId: reportsTo.id,
      resolver: 'REPORTS_TO',
    });

    tiers.push({
      order: tiers.length + 1,
      label: 'General Manager',
      approverId: gm.id,
      resolver: 'ROLE:General Manager',
    });

    tiers.push({
      order: tiers.length + 1,
      label: 'HR Manager',
      approverId: hrManager.id,
      resolver: 'ROLE:HR Manager',
    });

    return this.finalizeTiers(tiers);
  
    });
  }

  /**
   * Finds an active user whose primary role assignment matches the role name.
   */
  private async findActiveUserByPrimaryRoleName(
    companyId: string,
    roleName: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: activeOnly({
        companyId,
        isActive: true,
        employmentStatus: 'ACTIVE' as const,
        userRoles: {
          some: activeOnly({
            isPrimary: true,
            role: activeOnly({
              companyId,
              name: roleName,
            }),
          }),
        },
      }),
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
