import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import type { ResolvedApprovalTier } from '../../../approvals/application/services/approval-resolver.service';

interface ChainTierDraft {
  order: number;
  label: string;
  approverId: string;
  resolver: string;
}

/** HR and full-access roles that may create or submit HR requests on behalf of another employee. */
export const HR_OR_FULL_ACCESS_ROLES: readonly string[] = [
  'HR Officer',
  'HR Manager',
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
  'INSPECTION_REPAIR',
  'EXIT_PERMIT',
] as const;

export type HrOnBehalfModuleCode = (typeof HR_ON_BEHALF_MODULE_CODES)[number];

export interface ExitPermitChainOptions {
  /**
   * When true, do not skip Discipline Lead / HR Officer because the employee
   * occupies that tier. On-behalf filings still require those people to approve.
   */
  submittedOnBehalf?: boolean;
}

/**
 * Builds Discipline Lead → HR Officer → (optional) General Manager chains
 * for HR workflows (leave, overtime, etc.).
 * Role-based tiers resolve only users whose matching role is marked isPrimary.
 */
@Injectable()
export class HrApprovalChainService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Approval chain for purchase requests.
   * Employee → Discipline Lead → HR Officer → GM when total ETB > 10,000.
   * HR Officer / above skip Discipline Lead (and HR self-approval).
   * Empty array = auto-approve (HR+ with total ≤ 10,000).
   */
  async buildPurchaseApprovalChain(
    submitterId: string,
    totalEtb: number,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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
        'HR Officer',
        'HR Manager',
        'General Manager',
        'Managing Director',
        'System Administrator',
      ].includes(primaryRole) || submitter.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const disciplineLead = await this.getDisciplineLead(
        submitterId,
        companyId,
      );
      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: disciplineLead.id,
        resolver: 'DISCIPLINE_LEAD',
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

    if (totalEtb > 10000 && !isGmOrAbove) {
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
  }

  /**
   * Exit permit chain for the **employee** the permit belongs to.
   * Self-submit: Discipline Lead and HR Officer skip themselves (HR+ auto-approves).
   * On-behalf: those tiers still run, even if the employee occupies them.
   */
  async buildExitPermitApprovalChain(
    employeeId: string,
    companyId: string,
    options?: ExitPermitChainOptions,
  ): Promise<ResolvedApprovalTier[]> {
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
        ...HR_OR_FULL_ACCESS_ROLES,
      ].includes(primaryRole) || employee.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const disciplineLead = await this.getDisciplineLead(
        employeeId,
        companyId,
      );

      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: disciplineLead.id,
        resolver: 'DISCIPLINE_LEAD',
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
  }

  /**
   * Builds (without persisting) the approval chain a module would open for `employeeId`.
   * Value-dependent tiers (purchase > 10k ETB, overtime > 4h) assume the widest chain,
   * so callers see every tier the employee could need. Modules with no approval
   * workflow (inspection & repair) return an empty chain.
   */
  async buildChainForModule(
    moduleCode: HrOnBehalfModuleCode,
    employeeId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    switch (moduleCode) {
      case 'LEAVE_REQUEST':
        return this.buildOrgApprovalChain(employeeId, companyId, false);
      case 'EXPENSE_CLAIM':
      case 'PER_DIEM':
      case 'OVERTIME_APPLICATION':
        return this.buildOrgApprovalChain(employeeId, companyId, true);
      case 'PURCHASE_REQUEST':
        return this.buildPurchaseApprovalChain(
          employeeId,
          Number.MAX_SAFE_INTEGER,
          companyId,
        );
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
      case 'EXIT_PERMIT':
        return this.buildExitPermitApprovalChain(employeeId, companyId, {
          submittedOnBehalf: true,
        });
      case 'INSPECTION_REPAIR':
        return [];
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
   * On-behalf filings always require Discipline Lead (when assigned) and HR Officer,
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

    try {
      const disciplineLead = await this.getDisciplineLead(
        employeeId,
        companyId,
      );
      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: disciplineLead.id,
        resolver: 'DISCIPLINE_LEAD',
      });
    } catch (error: unknown) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }
    }

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
   * Employee → Discipline Lead → HR Officer → General Manager.
   * HR Officer / above skip Discipline Lead (and HR self-approval).
   * Empty array = auto-approve (GM+ submitter).
   */
  async buildMaterialRequisitionApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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
        'HR Officer',
        'HR Manager',
        'General Manager',
        'Managing Director',
        'System Administrator',
      ].includes(primaryRole) || submitter.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const disciplineLead = await this.getDisciplineLead(
        submitterId,
        companyId,
      );
      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: disciplineLead.id,
        resolver: 'DISCIPLINE_LEAD',
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
  }

  /**
   * Approval chain for consumables requisitions.
   * Empty array = HR Officer / above — direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildConsumablesApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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
  }

  /**
   * Approval chain for vehicle applications.
   * Empty array = HR Officer / above — direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildVehicleApplicationApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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
  }

  /**
   * Approval chain for vehicle refueling requests.
   * Empty array = HR Officer / above — direct APPROVED (no approval request).
   * Otherwise a single HR Officer tier.
   */
  async buildVehicleRefuelingApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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
  }

  /**
 * Approval chain for official seal requests.
 * Empty array = General Manager / above — direct APPROVED (no approval request).
 * if HR Officer / above, a single HR Officer tier. Then a General Manager tier.
 * Otherwise a single HR Officer and General Manager tier.
 */

  async buildOfficialSealApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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

  }

  async buildProjectSealApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
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

  }
  /**
   * Field movement / early departure: same chain as leave (Discipline Lead → HR).
   */
  async buildFieldMovementApprovalChain(
    userId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    return this.buildOrgApprovalChain(userId, companyId, false);
  }

  /**
   * Org-structure approval chain with role-based skips and duplicate collapse.
   * Regular employees: Discipline Lead → HR Officer → (optional) General Manager.
   * Discipline Lead / HR+ skip lower tiers they already satisfy (no self-approval).
   * GM+ with no remaining tiers → empty array (auto-approve).
   * @param includeGeneralManager When true, appends General Manager unless submitter is GM+.
   */
  async buildOrgApprovalChain(
    employeeId: string,
    companyId: string,
    includeGeneralManager: boolean,
  ): Promise<ResolvedApprovalTier[]> {
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

    const isGmOrAbove = [
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(primaryRole);

    const isDisciplineLeadOrAbove =
      [
        'Discipline Lead',
        ...HR_OR_FULL_ACCESS_ROLES,
      ].includes(primaryRole) || employee.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const disciplineLead = await this.getDisciplineLead(
        employeeId,
        companyId,
      );
      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: disciplineLead.id,
        resolver: 'DISCIPLINE_LEAD',
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

    if (includeGeneralManager && !isGmOrAbove) {
      const gm = await this.getGeneralManager(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'General Manager',
        approverId: gm.id,
        resolver: 'ROLE:General Manager',
      });
    }

    return this.finalizeTiers(tiers);
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
   * Resolves the discipline lead for an employee's engineering discipline.
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
              select: { id: true, deletedAt: true, isActive: true },
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
    if (
      !disciplineLeader ||
      disciplineLeader.deletedAt ||
      !disciplineLeader.isActive
    ) {
      throw new BadRequestException(
        "No discipline leader assigned for this employee's discipline.",
      );
    }

    return { id: disciplineLeader.id };
  }

  /**
   * Resolves the company HR Officer (primary role).
   */
  async getHROfficer(companyId: string): Promise<{ id: string }> {
    const hrOfficer = await this.findActiveUserByPrimaryRoleName(
      companyId,
      'HR Officer',
    );
    if (!hrOfficer) {
      throw new BadRequestException(
        'No user with primary role HR Officer found.',
      );
    }
    return hrOfficer;
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
      throw new BadRequestException(
        'No user with primary role General Manager found.',
      );
    }
    return gm;
  }

  /**
   * Flight approval chain with role-based tier skipping.
   * Empty array = GM / MD / SysAdmin — direct APPROVED record (no approval request).
   */
  async buildFlightApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    const submitter = await this.prisma.user.findFirst({
      where: activeOnly({ id: submitterId, companyId }),
      include: {
        userRoles: {
          where: activeOnly({ isPrimary: true }),
          include: { role: true },
        },
        engineeringDiscipline: {
          include: {
            leader: {
              select: { id: true, deletedAt: true, isActive: true },
            },
          },
        },
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!submitter) {
      throw new BadRequestException('Submitter not found');
    }

    const primaryRole = submitter.userRoles[0]?.role?.name ?? '';

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
        'HR Officer',
        'HR Manager',
        'General Manager',
        'Managing Director',
        'System Administrator',
      ].includes(primaryRole) || submitter.ledDisciplines.length > 0;

    const tiers: ChainTierDraft[] = [];

    if (!isDisciplineLeadOrAbove) {
      const lead = submitter.engineeringDiscipline?.leader;
      if (!lead || lead.deletedAt || !lead.isActive) {
        throw new BadRequestException(
          'No discipline leader assigned for your discipline.',
        );
      }
      tiers.push({
        order: 1,
        label: 'Discipline Lead',
        approverId: lead.id,
        resolver: 'DISCIPLINE_LEAD',
      });
    }

    if (!isHrOrAbove) {
      const hr = await this.getHROfficer(companyId);
      tiers.push({
        order: tiers.length + 1,
        label: 'HR Officer',
        approverId: hr.id,
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
  }

  /**
   * Passengers the submitter may include on a flight application.
   */
  async getSelectablePassengers(
    submitterId: string,
    companyId: string,
  ): Promise<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      name: string;
      position: string | null;
    }>
  > {
    const submitter = await this.prisma.user.findFirst({
      where: activeOnly({ id: submitterId, companyId }),
      include: {
        userRoles: {
          where: activeOnly({ isPrimary: true }),
          include: { role: true },
        },
        ledDisciplines: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!submitter) {
      throw new BadRequestException('Submitter not found');
    }

    const primaryRole = submitter.userRoles[0]?.role?.name ?? '';
    const canSelectAll = [
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ].includes(primaryRole);
    const isDisciplineLead = submitter.ledDisciplines.length > 0;

    const where = canSelectAll
      ? activeOnly({ companyId, isActive: true })
      : isDisciplineLead
        ? activeOnly({
            companyId,
            isActive: true,
            OR: [
              { id: submitterId },
              {
                engineeringDisciplineId: {
                  in: submitter.ledDisciplines.map((d) => d.id),
                },
              },
            ],
          })
        : activeOnly({ id: submitterId, companyId });

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: { select: { title: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`.trim(),
      position: user.position?.title ?? null,
    }));
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
