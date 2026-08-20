import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { ListLeaveBalancesDto } from '../dtos/leave.dtos';
import {
  OWN_BALANCE_LEAVE_TYPES,
  resolveBalanceLeaveType,
} from './leave-balance-rules';

const DEFAULT_ENTITLEMENTS: Record<LeaveType, number> = {
  ANNUAL: 20,
  SICK: 10,
  UNPAID: 0,
  MATERNITY: 0,
  PATERNITY: 0,
  EMERGENCY: 0,
  COMPASSIONATE: 0,
  STUDY: 0,
  EXAM: 0,
};

export type LeaveBalanceField = 'entitled' | 'used' | 'pending';

/**
 * Manages annual leave balance rows per employee / leave type.
 */
@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures leave balance rows exist for the employee/year (idempotent).
   * Call outside transactions — seeding can touch every leave type.
   */
  async ensureBalance(
    employeeId: string,
    year: number,
    companyId: string,
  ): Promise<void> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    const existing = await this.prisma.leaveBalance.findFirst({
      where: { employeeId, year, companyId },
      select: { id: true },
    });
    if (!existing) {
      await this.initializeBalance(employeeId, year, companyId);
    }
  }

  /**
   * Paginated company-wide leave balances for HR (annual, maternity, compassionate).
   */
  async listCompanyBalances(
    query: ListLeaveBalancesDto,
    companyId: string,
  ): Promise<PaginatedResult<unknown>> {
    const year = query.year ?? new Date().getFullYear();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const userWhere: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      isActive: true,
      ...(query.employeeId ? { id: query.employeeId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [employees, total] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        skip,
        take,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          chineseName: true,
        },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    if (employees.length === 0) {
      return buildPaginatedResult([], total, page, limit);
    }

    await Promise.all(
      employees.map((employee) =>
        this.ensureBalance(employee.id, year, companyId),
      ),
    );

    const employeeIds = employees.map((employee) => employee.id);
    const balanceRows = await this.prisma.leaveBalance.findMany({
      where: {
        companyId,
        year,
        employeeId: { in: employeeIds },
        leaveType: { in: OWN_BALANCE_LEAVE_TYPES },
      },
    });

    const data = employees.map((employee) => {
      const rows = balanceRows.filter(
        (row) => row.employeeId === employee.id,
      );
      const findRow = (leaveType: LeaveType): Record<string, unknown> | null => {
        const row = rows.find((item) => item.leaveType === leaveType);
        return row ? this.mapBalance(row) : null;
      };

      return {
        employeeId: employee.id,
        employee,
        year,
        annual: findRow(LeaveType.ANNUAL),
        maternity: findRow(LeaveType.MATERNITY),
        compassionate: findRow(LeaveType.COMPASSIONATE),
      };
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Returns all leave-type balances for an employee year, initializing defaults if missing.
   */
  async getBalance(
    employeeId: string,
    year: number,
    companyId: string,
  ): Promise<unknown[]> {
    await this.ensureBalance(employeeId, year, companyId);

    const rows = await this.prisma.leaveBalance.findMany({
      where: { companyId, employeeId, year },
      orderBy: { leaveType: 'asc' },
    });

    return rows.map((row) => this.mapBalance(row));
  }

  /**
   * Seeds default entitlements for every LeaveType for the year (idempotent).
   */
  async initializeBalance(
    employeeId: string,
    year: number,
    companyId: string,
  ): Promise<void> {
    await this.assertEmployeeInCompany(employeeId, companyId);

    for (const leaveType of Object.values(LeaveType)) {
      const existing = await this.prisma.leaveBalance.findUnique({
        where: {
          companyId_employeeId_year_leaveType: {
            companyId,
            employeeId,
            year,
            leaveType,
          },
        },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      await this.prisma.leaveBalance.create({
        data: {
          id: randomUUID(),
          companyId,
          employeeId,
          year,
          leaveType,
          entitled: new Prisma.Decimal(DEFAULT_ENTITLEMENTS[leaveType]),
          used: new Prisma.Decimal(0),
          pending: new Prisma.Decimal(0),
        },
      });
    }
  }

  /**
   * Adjusts a numeric balance field by a delta (can be negative).
   */
  async adjustBalance(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    field: LeaveBalanceField,
    amount: number,
    companyId: string,
  ): Promise<unknown> {
    const balanceLeaveType = resolveBalanceLeaveType(leaveType);
    await this.initializeBalance(employeeId, year, companyId);

    const row = await this.prisma.leaveBalance.findUnique({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId,
          employeeId,
          year,
          leaveType: balanceLeaveType,
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Leave balance not found');
    }

    const current = Number(row[field]);
    const next = current + amount;
    if (next < 0) {
      throw new BadRequestException(
        `Leave balance ${field} cannot go below zero`,
      );
    }

    const updated = await this.prisma.leaveBalance.update({
      where: { id: row.id },
      data: { [field]: new Prisma.Decimal(next) },
    });

    return this.mapBalance(updated);
  }

  /**
   * Ensures enough remaining balance exists before submitting leave.
   */
  async assertSufficientBalance(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    days: number,
    companyId: string,
  ): Promise<void> {
    const balanceLeaveType = resolveBalanceLeaveType(leaveType);
    const balances = await this.getBalance(employeeId, year, companyId);
    const row = (balances as Array<{ leaveType: string; remaining: number }>).find(
      (b) => b.leaveType === balanceLeaveType,
    );
    const remaining = row?.remaining ?? 0;
    if (days > remaining) {
      throw new BadRequestException(
        `Insufficient ${balanceLeaveType.toLowerCase()} leave balance. Remaining: ${remaining}, requested: ${days}`,
      );
    }
  }

  private async assertEmployeeInCompany(
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Employee not found in this company');
    }
  }

  private mapBalance(row: {
    id: string;
    companyId: string;
    employeeId: string;
    year: number;
    leaveType: LeaveType;
    entitled: Prisma.Decimal;
    broughtForward: Prisma.Decimal;
    used: Prisma.Decimal;
    pending: Prisma.Decimal;
    remaining: Prisma.Decimal | null;
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
    const entitled = Number(row.entitled);
    const broughtForward = Number(row.broughtForward);
    const used = Number(row.used);
    const pending = Number(row.pending);
    const remaining =
      row.remaining != null
        ? Number(row.remaining)
        : entitled + broughtForward - used - pending;

    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      year: row.year,
      leaveType: row.leaveType,
      entitled,
      broughtForward,
      used,
      pending,
      remaining,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
