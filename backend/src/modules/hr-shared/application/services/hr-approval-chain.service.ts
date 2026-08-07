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
   * Includes General Manager when the total ETB value exceeds 10,000.
   */
  async buildPurchaseApprovalChain(
    submitterId: string,
    totalEtb: number,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    return this.buildOrgApprovalChain(submitterId, companyId, totalEtb > 10000);
  }

  /**
   * Approval chain for material requisitions.
   * Always Discipline Lead → HR Officer → General Manager (duplicates collapsed).
   */
  async buildMaterialRequisitionApprovalChain(
    submitterId: string,
    companyId: string,
  ): Promise<ResolvedApprovalTier[]> {
    return this.buildOrgApprovalChain(submitterId, companyId, true);
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
   * Org-structure approval chain with duplicate approver collapse.
   * @param includeGeneralManager When true, appends General Manager as tier 3.
   */
  async buildOrgApprovalChain(
    employeeId: string,
    companyId: string,
    includeGeneralManager: boolean,
  ): Promise<ResolvedApprovalTier[]> {
    const tiers: ChainTierDraft[] = [];

    const disciplineLead = await this.getDisciplineLead(employeeId, companyId);
    tiers.push({
      order: 1,
      label: 'Discipline Lead',
      approverId: disciplineLead.id,
      resolver: 'DISCIPLINE_LEAD',
    });

    const hrOfficer = await this.getHROfficer(companyId);
    tiers.push({
      order: 2,
      label: 'HR Officer',
      approverId: hrOfficer.id,
      resolver: 'ROLE:HR Officer',
    });

    if (includeGeneralManager) {
      const gm = await this.getGeneralManager(companyId);
      tiers.push({
        order: 3,
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
