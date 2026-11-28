import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/**
 * Resolves the basic salary payroll should use for an employee on a date.
 *
 * 1. Position history row covering the date with salaryOverride set.
 * 2. Otherwise the employee contract whose dates cover that day.
 *
 * A history row covers `date` when effectiveFrom <= date and effectiveTo is
 * null or strictly after date (effectiveTo is exclusive).
 */
@Injectable()
export class EffectiveSalaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Basic salary in force on `date`, or null when neither a salary override
   * nor a covering contract exists.
   */
  async getEffectiveSalary(userId: string, date: Date): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
    if (!user) {
      return null;
    }

    const override = await this.findSalaryOverride(user.companyId, userId, date);
    if (override != null) {
      return override;
    }

    const contract = await this.prisma.employeeContract.findFirst({
      where: {
        companyId: user.companyId,
        employeeId: userId,
        deletedAt: null,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      orderBy: { startDate: 'desc' },
      select: { basicSalary: true },
    });
    return this.toNumber(contract?.basicSalary);
  }

  /**
   * Position-history salary override covering `date`, or null when payroll
   * should keep the contract basic salary.
   */
  async findSalaryOverride(
    companyId: string,
    userId: string,
    date: Date,
  ): Promise<number | null> {
    const details = await this.findSalaryOverrideDetails(companyId, userId, date);
    return details?.amount ?? null;
  }

  /**
   * Override amount and the date it took effect, for contract list badges.
   */
  async findSalaryOverrideDetails(
    companyId: string,
    userId: string,
    date: Date,
  ): Promise<{ amount: number; effectiveFrom: Date } | null> {
    const row = await this.prisma.positionHistory.findFirst({
      where: {
        companyId,
        userId,
        deletedAt: null,
        salaryOverride: { not: null },
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { salaryOverride: true, effectiveFrom: true },
    });
    const amount = this.toNumber(row?.salaryOverride);
    if (amount == null || !row) {
      return null;
    }
    return { amount, effectiveFrom: row.effectiveFrom };
  }

  /**
   * Batch override details for many employees on one date (contract list).
   */
  async findSalaryOverridesForEmployees(
    companyId: string,
    userIds: string[],
    date: Date,
  ): Promise<Map<string, { amount: number; effectiveFrom: Date }>> {
    const result = new Map<string, { amount: number; effectiveFrom: Date }>();
    if (userIds.length === 0) {
      return result;
    }
    const rows = await this.prisma.positionHistory.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        deletedAt: null,
        salaryOverride: { not: null },
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { userId: true, salaryOverride: true, effectiveFrom: true },
    });
    for (const row of rows) {
      if (result.has(row.userId)) {
        continue;
      }
      const amount = this.toNumber(row.salaryOverride);
      if (amount != null) {
        result.set(row.userId, { amount, effectiveFrom: row.effectiveFrom });
      }
    }
    return result;
  }

  private toNumber(
    value: Prisma.Decimal | null | undefined,
  ): number | null {
    if (value == null) {
      return null;
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }
}
