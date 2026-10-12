import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';
import { ListLeaveBalancesDto } from '../dtos/leave.dtos';
import {
  OWN_BALANCE_LEAVE_TYPES,
  resolveBalanceLeaveType,
} from './leave-balance-rules';
import { roundDays } from '../../../leave-policy/application/utils/leave-year.util';

/** Only pending days are kept on leave_balance directly; the rest is ledger. */
export type LeaveBalanceField = 'pending';

/**
 * Leave balance rows per employee / leave year (employment anniversary) /
 * leave type. Entitled, brought-forward and used are a cache of the
 * LeaveBalanceEntry ledger (see LeaveLedgerService); pending days live here.
 * `year` is the calendar year in which the leave year starts.
 */
@Injectable()
export class LeaveBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveLedger: LeaveLedgerService,
  ) {}

  /**
   * Ensures leave balance rows exist for the employee / leave year
   * (idempotent; the current leave year gets its entitlement on first read).
   */
  async ensureBalance(
    employeeId: string,
    year: number,
    companyId: string,
  ): Promise<void> {
    await this.leaveLedger.ensureLeaveYear(employeeId, companyId, year);
  }

  /** Leave-year label (leave_balance.year) for the leave year containing `date`. */
  async yearLabelForDate(
    employeeId: string,
    companyId: string,
    date: Date,
  ): Promise<number> {
    return this.leaveLedger.yearLabelForDate(employeeId, companyId, date);
  }

  /**
   * Paginated company-wide leave balances for HR (annual, maternity, sick).
   * Without `year`, each employee's current leave year is shown.
   */
  async listCompanyBalances(
    query: ListLeaveBalancesDto,
    companyId: string,
  ): Promise<PaginatedResult<unknown>> {
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

    const yearByEmployee = new Map<string, number>();
    for (const employee of employees) {
      const year =
        query.year ??
        (await this.leaveLedger.currentYearLabel(employee.id, companyId));
      yearByEmployee.set(employee.id, year);
      await this.ensureBalance(employee.id, year, companyId);
    }

    const balanceRows = await this.prisma.leaveBalance.findMany({
      where: {
        companyId,
        OR: employees.map((employee) => ({
          employeeId: employee.id,
          year: yearByEmployee.get(employee.id)!,
        })),
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
        year: yearByEmployee.get(employee.id),
        annual: findRow(LeaveType.ANNUAL),
        maternity: findRow(LeaveType.MATERNITY),
        sick: findRow(LeaveType.SICK),
      };
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * All leave-type balances for an employee leave year (default: current).
   */
  async getBalance(
    employeeId: string,
    year: number | undefined,
    companyId: string,
  ): Promise<unknown[]> {
    const label =
      year ?? (await this.leaveLedger.currentYearLabel(employeeId, companyId));
    await this.ensureBalance(employeeId, label, companyId);

    const rows = await this.prisma.leaveBalance.findMany({
      where: { companyId, employeeId, year: label },
      orderBy: { leaveType: 'asc' },
    });

    return rows.map((row) => this.mapBalance(row));
  }

  /** Kept for callers: same as ensureBalance. */
  async initializeBalance(
    employeeId: string,
    year: number,
    companyId: string,
  ): Promise<void> {
    await this.ensureBalance(employeeId, year, companyId);
  }

  /**
   * Adjusts pending days by a delta (can be negative). Used days come from
   * the ledger (LeaveLedgerService.recordLeaveUsed / reverseLeaveUsed).
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
    await this.ensureBalance(employeeId, year, companyId);

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
    const next = Math.round((current + amount) * 10) / 10;
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

  /** Pending-days delta for the leave year containing `date`. */
  async adjustPendingForDate(
    employeeId: string,
    leaveType: LeaveType,
    date: Date,
    amount: number,
    companyId: string,
  ): Promise<unknown> {
    const year = await this.yearLabelForDate(employeeId, companyId, date);
    return this.adjustBalance(
      employeeId,
      leaveType,
      year,
      'pending',
      amount,
      companyId,
    );
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
    const requested = roundDays(days);
    const available = roundDays(remaining);
    if (requested > available) {
      throw new BadRequestException(
        `Insufficient ${balanceLeaveType.toLowerCase()} leave balance. Remaining: ${available}, requested: ${requested}`,
      );
    }
  }

  /**
   * Balance import: entitled + broughtForward become an OPENING_BALANCE (empty
   * year) or an ADJUSTMENT for the difference — never an in-place overwrite.
   */
  async upsertEntitlement(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    entitled: number,
    broughtForward: number,
    companyId: string,
    actorUserId: string | null = null,
  ): Promise<{ created: boolean; balance: Record<string, unknown> }> {
    if (!OWN_BALANCE_LEAVE_TYPES.includes(leaveType)) {
      throw new BadRequestException(
        `Leave type ${leaveType} does not support balance entitlements`,
      );
    }
    if (entitled < 0 || broughtForward < 0) {
      throw new BadRequestException(
        'entitled and broughtForward must be zero or greater',
      );
    }

    const result = await this.leaveLedger.applyImportedBalance({
      employeeId,
      companyId,
      leaveType,
      yearLabel: year,
      entitled,
      broughtForward,
      actorUserId,
    });

    const row = await this.prisma.leaveBalance.findUniqueOrThrow({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId,
          employeeId,
          year,
          leaveType,
        },
      },
    });

    return { created: result.created, balance: this.mapBalance(row) };
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
