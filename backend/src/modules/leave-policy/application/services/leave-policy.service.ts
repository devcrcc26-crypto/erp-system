import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CreateLeavePolicyDto,
  LeavePolicyRuleDto,
  UpdateLeavePolicyDto,
} from '../dtos/leave-policy.dtos';

import { LeaveLedgerService } from './leave-ledger.service';
import {
  entitlementFromPolicyRule,
  getBalanceLeaveType,
  leaveTypeAffectsBalance,
  POLICY_BALANCE_LEAVE_TYPES,
  type PolicyRuleRow,
} from '../utils/leave-entitlement.util';

export {
  getBalanceLeaveType,
  leaveTypeAffectsBalance,
  POLICY_BALANCE_LEAVE_TYPES,
};

@Injectable()
export class LeavePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveLedger: LeaveLedgerService,
  ) {}

  /**
   * Creates a leave policy with rules in one transaction.
   */
  async createPolicy(
    dto: CreateLeavePolicyDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    this.assertValidRules(dto.rules);

    const created = await this.prisma.$transaction(async (tx) => {
      const policy = await tx.leavePolicy.create({
        data: {
          id: randomUUID(),
          companyId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          governedBy: dto.governedBy?.trim() || null,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
          rules: {
            create: dto.rules.map((rule) => this.toRuleCreateData(rule)),
          },
        },
        include: this.policyInclude(),
      });
      return policy;
    });

    return this.mapPolicy(created);
  }

  /**
   * Returns one policy with rules (company-scoped).
   */
  async getPolicy(id: string, companyId: string): Promise<unknown> {
    const policy = await this.findPolicyOrThrow(id, companyId);
    return this.mapPolicy(policy);
  }

  /**
   * Lists company leave policies with rule and employee counts.
   */
  async listPolicies(companyId: string): Promise<unknown[]> {
    const rows = await this.prisma.leavePolicy.findMany({
      where: activeOnly({ companyId }),
      orderBy: { name: 'asc' },
      include: {
        rules: { orderBy: { leaveType: 'asc' } },
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
          },
        },
      },
    });
    return rows.map((row) => this.mapPolicy(row));
  }

  /**
   * Active policies for employee assignment pickers.
   */
  async listActivePolicies(companyId: string): Promise<unknown[]> {
    const rows = await this.prisma.leavePolicy.findMany({
      where: activeOnly({ companyId, isActive: true }),
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
      },
    });
    return rows;
  }

  /**
   * Updates policy metadata and optionally replaces all rules.
   */
  async updatePolicy(
    id: string,
    dto: UpdateLeavePolicyDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.findPolicyOrThrow(id, companyId);
    if (dto.rules) {
      this.assertValidRules(dto.rules);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.rules) {
        await tx.leavePolicyRule.deleteMany({ where: { leavePolicyId: id } });
        await tx.leavePolicyRule.createMany({
          data: dto.rules.map((rule) => ({
            id: randomUUID(),
            leavePolicyId: id,
            ...this.toRuleScalarData(rule),
          })),
        });
      }

      return tx.leavePolicy.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.governedBy !== undefined
            ? { governedBy: dto.governedBy?.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedBy: userId,
        },
        include: this.policyInclude(),
      });
    });

    return this.mapPolicy(updated);
  }

  /**
   * Soft-deletes a policy. Blocked when active employees are assigned.
   */
  async deletePolicy(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    await this.findPolicyOrThrow(id, companyId);

    const assigned = await this.prisma.user.count({
      where: {
        companyId,
        leavePolicyId: id,
        deletedAt: null,
      },
    });
    if (assigned > 0) {
      throw new ConflictException(
        'Cannot delete - employees are assigned to this policy',
      );
    }

    await this.prisma.leavePolicy.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        isActive: false,
        updatedBy: userId,
      },
    });
  }

  /**
   * Calculates entitlement days for an employee / leave type / year.
   */
  async calculateEntitlement(
    employeeId: string,
    leaveType: LeaveType,
    companyId: string,
    year: number,
  ): Promise<number> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: {
        leavePolicyId: true,
        employmentDate: true,
        leavePolicy: {
          where: activeOnly({}),
          include: {
            rules: { where: { leaveType } },
          },
        },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found in this company');
    }
    if (!employee.leavePolicyId || !employee.leavePolicy) {
      return 0;
    }

    const rule = employee.leavePolicy.rules[0];
    if (!rule) {
      return 0;
    }

    const serviceStart = await this.resolveServiceStartDate(
      employeeId,
      companyId,
      employee.employmentDate,
    );
    const yearsOfService = this.calculateYearsOfService(serviceStart, year);
    return this.entitlementFromRule(rule, yearsOfService);
  }

  /**
   * Leave policy assigned / changed: aligns the current leave year's
   * ENTITLEMENT entries with the policy (ledger correction, never an edit).
   * `year` is kept for callers; the ledger uses the employee's leave year.
   */
  async initializeBalances(
    employeeId: string,
    companyId: string,
    _year: number,
  ): Promise<void> {
    await this.leaveLedger.reconcilePolicyEntitlement(
      employeeId,
      companyId,
      null,
    );
  }

  /**
   * Opens the employee's leave year for `year` (entitlement for the service
   * years at its start + annual carry-over / expiry). Idempotent per leave year.
   * The leave year follows the employment anniversary, not the contract start.
   */
  async refreshEmployeeBalances(
    employeeId: string,
    companyId: string,
    year: number,
    anniversaryDate?: Date,
  ): Promise<void> {
    const onDate =
      anniversaryDate != null
        ? new Date(
            Date.UTC(
              year,
              anniversaryDate.getUTCMonth(),
              anniversaryDate.getUTCDate(),
            ),
          )
        : new Date(Date.UTC(year, 0, 1));
    await this.leaveLedger.openLeaveYearForDate(
      employeeId,
      companyId,
      onDate,
      'Leave year opened (anniversary)',
    );
  }

  /**
   * Calendar-year safety net (1 January) for employees with no employment
   * date and no contract - their leave year is the calendar year. Everyone
   * else opens on their employment anniversary (cron) or on first read.
   */
  async refreshAllBalances(
    companyId: string,
    year: number,
  ): Promise<{
    refreshed: number;
  }> {
    const employees = await this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId,
        deletedAt: null,
        isActive: true,
        employmentDate: null,
        employeeContractEmployee: { none: { deletedAt: null } },
      }),
      select: { id: true },
    });

    let refreshed = 0;
    for (const employee of employees) {
      await this.refreshEmployeeBalances(employee.id, companyId, year);
      refreshed += 1;
    }

    return { refreshed };
  }

  /**
   * Pure entitlement math for previews and balance seeding.
   */
  entitlementFromRule(rule: PolicyRuleRow, yearsOfService: number): number {
    return entitlementFromPolicyRule(rule, yearsOfService);
  }

  /**
   * Years of service as of Dec 31 of the given year (or today if current year).
   */
  calculateYearsOfService(
    serviceStart: Date | null,
    year: number,
  ): number {
    if (!serviceStart) {
      return 0;
    }
    const now = new Date();
    const asOf =
      year < now.getFullYear()
        ? new Date(Date.UTC(year, 11, 31))
        : year > now.getFullYear()
          ? new Date(Date.UTC(year, 11, 31))
          : now;
    const start = new Date(
      Date.UTC(
        serviceStart.getUTCFullYear(),
        serviceStart.getUTCMonth(),
        serviceStart.getUTCDate(),
      ),
    );
    const ms = asOf.getTime() - start.getTime();
    if (ms <= 0) {
      return 0;
    }
    return Math.round((ms / (365.25 * 24 * 60 * 60 * 1000)) * 1000) / 1000;
  }

  private async resolveServiceStartDate(
    employeeId: string,
    companyId: string,
    employmentDate: Date | null,
  ): Promise<Date | null> {
    const firstContract = await this.prisma.employeeContract.findFirst({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
      },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    return firstContract?.startDate ?? employmentDate ?? null;
  }

  private assertValidRules(rules: LeavePolicyRuleDto[]): void {
    const seen = new Set<LeaveType>();
    for (const rule of rules) {
      if (seen.has(rule.leaveType)) {
        throw new BadRequestException(
          `Duplicate leave type in rules: ${rule.leaveType}`,
        );
      }
      seen.add(rule.leaveType);

      if (rule.isProgressive) {
        if (
          rule.incrementDays === undefined ||
          rule.incrementDays === null ||
          rule.incrementEveryYears === undefined ||
          rule.incrementEveryYears === null
        ) {
          throw new BadRequestException(
            `Progressive rule for ${rule.leaveType} requires incrementDays and incrementEveryYears`,
          );
        }
      }
    }
  }

  private toRuleCreateData(
    rule: LeavePolicyRuleDto,
  ): Prisma.LeavePolicyRuleCreateWithoutPolicyInput {
    return {
      id: randomUUID(),
      ...this.toRuleScalarData(rule),
    };
  }

  private toRuleScalarData(rule: LeavePolicyRuleDto): {
    leaveType: LeaveType;
    baseDays: Prisma.Decimal;
    isProgressive: boolean;
    incrementDays: Prisma.Decimal | null;
    incrementEveryYears: number | null;
    minimumServiceMonths: number;
    maxDaysCap: Prisma.Decimal | null;
    maxCarryForwardDays: Prisma.Decimal | null;
    requiresReceipt: boolean;
  } {
    const isProgressive = Boolean(rule.isProgressive);
    return {
      leaveType: rule.leaveType,
      baseDays: new Prisma.Decimal(rule.baseDays),
      isProgressive,
      incrementDays:
        isProgressive && rule.incrementDays != null
          ? new Prisma.Decimal(rule.incrementDays)
          : null,
      incrementEveryYears: isProgressive
        ? (rule.incrementEveryYears ?? null)
        : null,
      minimumServiceMonths: rule.minimumServiceMonths ?? 0,
      maxDaysCap:
        rule.maxDaysCap != null ? new Prisma.Decimal(rule.maxDaysCap) : null,
      maxCarryForwardDays:
        rule.maxCarryForwardDays != null
          ? new Prisma.Decimal(rule.maxCarryForwardDays)
          : null,
      requiresReceipt: Boolean(rule.requiresReceipt),
    };
  }

  private policyInclude() {
    return {
      rules: { orderBy: { leaveType: 'asc' as const } },
      _count: {
        select: {
          employees: { where: { deletedAt: null } },
        },
      },
    };
  }

  private async findPolicyOrThrow(id: string, companyId: string) {
    const policy = await this.prisma.leavePolicy.findFirst({
      where: activeOnly({ id, companyId }),
      include: this.policyInclude(),
    });
    if (!policy) {
      throw new NotFoundException('Leave policy not found');
    }
    return policy;
  }

  private mapPolicy(
    policy: {
      id: string;
      companyId: string;
      name: string;
      description: string | null;
      governedBy?: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      rules?: Array<{
        id: string;
        leaveType: LeaveType;
        baseDays: Prisma.Decimal;
        isProgressive: boolean;
        incrementDays: Prisma.Decimal | null;
        incrementEveryYears: number | null;
        minimumServiceMonths: number;
        maxDaysCap: Prisma.Decimal | null;
        maxCarryForwardDays: Prisma.Decimal | null;
        requiresReceipt: boolean;
      }>;
      _count?: { employees: number };
    },
  ): Record<string, unknown> {
    return {
      id: policy.id,
      companyId: policy.companyId,
      name: policy.name,
      description: policy.description,
      governedBy: policy.governedBy ?? null,
      isActive: policy.isActive,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      employeeCount: policy._count?.employees ?? 0,
      ruleCount: policy.rules?.length ?? 0,
      rules: (policy.rules ?? []).map((rule) => ({
        id: rule.id,
        leaveType: rule.leaveType,
        baseDays: Number(rule.baseDays),
        isProgressive: rule.isProgressive,
        incrementDays:
          rule.incrementDays != null ? Number(rule.incrementDays) : null,
        incrementEveryYears: rule.incrementEveryYears,
        minimumServiceMonths: rule.minimumServiceMonths,
        maxDaysCap: rule.maxDaysCap != null ? Number(rule.maxDaysCap) : null,
        maxCarryForwardDays:
          rule.maxCarryForwardDays != null
            ? Number(rule.maxCarryForwardDays)
            : null,
        requiresReceipt: rule.requiresReceipt,
      })),
    };
  }
}
