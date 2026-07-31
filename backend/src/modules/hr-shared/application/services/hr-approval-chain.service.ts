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
 */
@Injectable()
export class HrApprovalChainService {
  constructor(private readonly prisma: PrismaService) {}

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
        "Employee is not assigned to an engineering discipline.",
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

    tiers.push({
      order: 1,
      label: 'Discipline Lead',
      approverId: disciplineLeader.id,
      resolver: 'DISCIPLINE_LEAD',
    });

    const hrOfficer = await this.findActiveUserByRoleName(
      companyId,
      'HR Officer',
    );
    if (!hrOfficer) {
      throw new BadRequestException('No HR Officer found in the system.');
    }

    tiers.push({
      order: 2,
      label: 'HR Officer',
      approverId: hrOfficer.id,
      resolver: 'ROLE:HR Officer',
    });

    if (includeGeneralManager) {
      const gm = await this.findActiveUserByRoleName(
        companyId,
        'General Manager',
      );
      if (!gm) {
        throw new BadRequestException(
          'No General Manager found in the system.',
        );
      }

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

  private async findActiveUserByRoleName(
    companyId: string,
    roleName: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: activeOnly({
        companyId,
        isActive: true,
        userRoles: {
          some: activeOnly({
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
