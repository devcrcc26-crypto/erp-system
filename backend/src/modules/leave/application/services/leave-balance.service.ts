import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  formatLeaveYearRange,
  leaveCalendarOrigin,
  leaveYearByLabel,
  leaveYearFor,
  roundDays,
  splitRangeByLeaveYears,
  toDateOnlyKey,
  toDateOnlyUtc,
  type LeaveYear,
  type LeaveYearAnchor,
} from '../../../leave-policy/application/utils/leave-year.util';
import { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';
import { ListLeaveBalancesDto } from '../dtos/leave.dtos';
import {
  leaveTypeAffectsBalance,
  OWN_BALANCE_LEAVE_TYPES,
  resolveBalanceLeaveType,
} from './leave-balance-rules';

/** Only pending days are kept on leave_balance directly; the rest is ledger. */
export type LeaveBalanceField = 'pending';

export interface LeaveYearCharge {
  year: LeaveYear;
  days: number;
}

/**
 * Leave balance rows per employee / leave year (contract start + anniversaries) /
 * leave type. Entitled, brought-forward and used are read from the
 * LeaveBalanceEntry ledger via LeaveLedgerService.getLeaveBalance; pending
 * days live on leave_balance.
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
   * Shared balance read for validator and UI - ledger for the leave year
   * containing `date`, never a stale generated remaining column alone.
   */
  async getLeaveBalance(
    employeeId: string,
    companyId: string,
    leaveType: LeaveType,
    date: Date | string,
  ): Promise<{
    employeeId: string;
    leaveType: LeaveType;
    year: number;
    leaveYearStart: string;
    leaveYearEnd: string;
    entitled: number;
    broughtForward: number;
    used: number;
    pending: number;
    remaining: number;
    leavePolicyId: string | null;
  }> {
    const view = await this.leaveLedger.getLeaveBalance(
      employeeId,
      companyId,
      leaveType,
      date,
    );
    return {
      employeeId: view.employeeId,
      leaveType: view.leaveType,
      year: view.year.label,
      leaveYearStart: view.year.start,
      leaveYearEnd: view.year.end,
      entitled: view.entitled,
      broughtForward: view.broughtForward,
      used: view.used,
      pending: view.pending,
      remaining: view.remaining,
      leavePolicyId: view.leavePolicyId,
    };
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

    const userWhere: Prisma.UserWhereInput = hrProcessEmployeeWhere({
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
    });

    const [employees, total] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        skip,
        take,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          email: true,
          chineseName: true,
          gender: true,
        },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    if (employees.length === 0) {
      return buildPaginatedResult([], total, page, limit);
    }

    // One ensure + one batched cache read per page - not 3× getLeaveBalance
    // per employee (that exhausted the Postgres pool / reset connections).
    const yearByEmployee = new Map<string, number>();
    for (const employee of employees) {
      const resolved =
        query.year ??
        (await this.leaveLedger.currentYearLabel(employee.id, companyId));
      yearByEmployee.set(employee.id, resolved);
      await this.ensureBalance(employee.id, resolved, companyId);
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
      const year = yearByEmployee.get(employee.id)!;
      const rows = balanceRows.filter(
        (row) => row.employeeId === employee.id && row.year === year,
      );
      const findRow = (
        leaveType: LeaveType,
      ): Record<string, unknown> | null => {
        const row = rows.find((item) => item.leaveType === leaveType);
        return row ? this.mapCacheBalance(row) : null;
      };

      return {
        employeeId: employee.id,
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          middleName: employee.middleName,
          lastName: employee.lastName,
          email: employee.email,
          chineseName: employee.chineseName,
          gender: employee.gender,
        },
        year,
        annual: findRow(LeaveType.ANNUAL),
        maternity: findRow(LeaveType.MATERNITY),
        sick: findRow(LeaveType.SICK),
      };
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * All leave-type balances for an employee leave year (default: current).
   * Uses getLeaveBalance (ledger) - same source as validation.
   */
  async getBalance(
    employeeId: string,
    year: number | undefined,
    companyId: string,
  ): Promise<unknown[]> {
    // Backfill USED for approved leave that never posted (e.g. anniversary-split
    // approvals that failed while releasing pending), then rebuild pending.
    await this.leaveLedger.ensureApprovedLeaveRecorded(employeeId, companyId);
    await this.recomputePendingFromOpenRequests(employeeId, companyId);

    const label =
      year ?? (await this.leaveLedger.currentYearLabel(employeeId, companyId));
    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const leaveYear = leaveYearByLabel(calendar, label);
    // Only own-balance buckets (ANNUAL / SICK / MATERNITY). Iterating every
    // LeaveType would map STUDY/EMERGENCY/… onto ANNUAL and duplicate keys.
    const rows = await Promise.all(
      OWN_BALANCE_LEAVE_TYPES.map(async (leaveType) => {
        const row = await this.getLeaveBalance(
          employeeId,
          companyId,
          leaveType,
          leaveYear.start,
        );
        return this.mapLedgerBalance(row);
      }),
    );
    return rows.sort((a, b) =>
      String(a.leaveType).localeCompare(String(b.leaveType)),
    );
  }

  /**
   * Leave-year options for the profile year dropdown (newest first).
   * Includes every year from employment through the current leave year.
   */
  async listLeaveYears(
    employeeId: string,
    companyId: string,
  ): Promise<{
    current: { label: number; start: string; end: string };
    years: Array<{ label: number; start: string; end: string }>;
  }> {
    const anchor = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const current = leaveYearFor(anchor, new Date());
    const labels = new Set<number>([current.label]);
    const origin = leaveCalendarOrigin(anchor);
    if (origin) {
      const first = leaveYearFor(anchor, origin).label;
      for (let label = first; label <= current.label + 1; label += 1) {
        labels.add(label);
      }
    }
    const stored = await this.prisma.leaveBalance.findMany({
      where: { companyId, employeeId },
      select: { year: true },
      distinct: ['year'],
    });
    for (const row of stored) {
      labels.add(row.year);
    }
    const years = [...labels]
      .sort((a, b) => b - a)
      .map((label) => {
        const year = leaveYearByLabel(anchor, label);
        return {
          label: year.label,
          start: toDateOnlyKey(year.start),
          end: toDateOnlyKey(year.end),
        };
      });
    return {
      current: {
        label: current.label,
        start: toDateOnlyKey(current.start),
        end: toDateOnlyKey(current.end),
      },
      years,
    };
  }

  /**
   * Rebuilds leave_balance.pending from SUBMITTED / IN_REVIEW requests only.
   * Clears stale pending left behind when approval released the wrong year.
   */
  async recomputePendingFromOpenRequests(
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const open = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        status: { in: ['SUBMITTED', 'IN_REVIEW'] },
        leaveType: { in: [...OWN_BALANCE_LEAVE_TYPES] },
      },
      select: {
        leaveType: true,
        startDate: true,
        days: true,
        periods: {
          select: { startDate: true, endDate: true, days: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    const pendingByKey = new Map<string, number>();
    for (const leave of open) {
      if (!leaveTypeAffectsBalance(leave.leaveType)) {
        continue;
      }
      const leaveType = resolveBalanceLeaveType(leave.leaveType);
      const charges = await this.chargeDaysByLeaveYear(
        employeeId,
        companyId,
        this.periodDaysAsBreakdown(
          calendar,
          leave.periods.map((period) => ({
            startDate: period.startDate,
            endDate: period.endDate,
            days: Number(period.days),
          })),
          leave.startDate ?? undefined,
          leave.days != null ? Number(leave.days) : undefined,
        ),
      );
      for (const charge of charges) {
        const key = `${leaveType}:${charge.year.label}`;
        pendingByKey.set(
          key,
          roundDays((pendingByKey.get(key) ?? 0) + charge.days),
        );
      }
    }

    const rows = await this.prisma.leaveBalance.findMany({
      where: {
        companyId,
        employeeId,
        leaveType: { in: [...OWN_BALANCE_LEAVE_TYPES] },
      },
      select: { id: true, leaveType: true, year: true, pending: true },
    });
    for (const row of rows) {
      const next = pendingByKey.get(`${row.leaveType}:${row.year}`) ?? 0;
      if (Number(row.pending) === next) {
        continue;
      }
      await this.prisma.leaveBalance.update({
        where: { id: row.id },
        data: { pending: new Prisma.Decimal(next) },
      });
    }
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
    if (!leaveTypeAffectsBalance(leaveType)) {
      return null;
    }
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
    const rawNext = Math.round((current + amount) * 10) / 10;
    // Pending release must clamp at 0: anniversary-split approvals used to
    // subtract the full request from one year and leave leftover pending on
    // another; a hard throw then blocked recordLeaveUsed.
    const next =
      field === 'pending' && rawNext < 0
        ? 0
        : rawNext;
    if (next < 0) {
      throw new BadRequestException(
        `Leave balance ${field} cannot go below zero`,
      );
    }

    await this.prisma.leaveBalance.update({
      where: { id: row.id },
      data: { [field]: new Prisma.Decimal(next) },
    });

    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const leaveYear = leaveYearByLabel(calendar, year);
    return this.getLeaveBalance(
      employeeId,
      companyId,
      balanceLeaveType,
      leaveYear.start,
    ).then((balance) => this.mapLedgerBalance(balance));
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
   * Release or reserve pending days split by leave year (anniversary-aware).
   * `sign` is +1 to reserve, −1 to release. Uses stored period days.
   */
  async adjustPendingForLeavePeriods(
    employeeId: string,
    companyId: string,
    leaveType: LeaveType,
    periods: ReadonlyArray<{ startDate: Date; endDate: Date; days: number }>,
    sign: 1 | -1,
    fallbackStart?: Date,
    fallbackDays?: number,
  ): Promise<void> {
    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const charges = await this.chargeDaysByLeaveYear(
      employeeId,
      companyId,
      this.periodDaysAsBreakdown(
        calendar,
        periods,
        fallbackStart,
        fallbackDays,
      ),
    );
    for (const charge of charges) {
      await this.adjustBalance(
        employeeId,
        leaveType,
        charge.year.label,
        'pending',
        roundDays(charge.days * sign),
        companyId,
      );
    }
  }

  /**
   * Approximate day weights from stored period days for pending release when
   * the original schedule breakdown is no longer available.
   */
  private periodDaysAsBreakdown(
    anchor: LeaveYearAnchor,
    periods: ReadonlyArray<{ startDate: Date; endDate: Date; days: number }>,
    fallbackStart?: Date,
    fallbackDays?: number,
  ): Array<{ date: Date; weight: number }> {
    const rows: Array<{ date: Date; weight: number }> = [];
    const source =
      periods.length > 0
        ? periods
        : fallbackStart != null && fallbackDays != null
          ? [
              {
                startDate: fallbackStart,
                endDate: fallbackStart,
                days: fallbackDays,
              },
            ]
          : [];
    for (const period of source) {
      if (!(period.days > 0)) {
        continue;
      }
      const segments = splitRangeByLeaveYears(
        anchor,
        period.startDate,
        period.endDate,
      );
      if (segments.length === 0) {
        continue;
      }
      if (segments.length === 1) {
        rows.push({ date: segments[0]!.year.start, weight: period.days });
        continue;
      }
      const totalDays = segments.reduce((sum, segment) => {
        const start = toDateOnlyUtc(segment.start).getTime();
        const end = toDateOnlyUtc(segment.end).getTime();
        return sum + Math.floor((end - start) / 86_400_000) + 1;
      }, 0);
      let allocated = 0;
      segments.forEach((segment, index) => {
        const start = toDateOnlyUtc(segment.start).getTime();
        const end = toDateOnlyUtc(segment.end).getTime();
        const calendarDays = Math.floor((end - start) / 86_400_000) + 1;
        const share =
          index === segments.length - 1
            ? roundDays(period.days - allocated)
            : roundDays((period.days * calendarDays) / totalDays);
        allocated = roundDays(allocated + share);
        rows.push({ date: segment.year.start, weight: share });
      });
    }
    return rows;
  }

  /**
   * Group charged day weights by leave year (for ranges that cross an anniversary).
   */
  async chargeDaysByLeaveYear(
    employeeId: string,
    companyId: string,
    breakdown: ReadonlyArray<{ date: Date; weight: number }>,
  ): Promise<LeaveYearCharge[]> {
    const anchor = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const byLabel = new Map<number, LeaveYearCharge>();
    for (const day of breakdown) {
      if (!(day.weight > 0)) {
        continue;
      }
      const year = leaveYearFor(anchor, day.date);
      const existing = byLabel.get(year.label);
      if (existing) {
        existing.days = roundDays(existing.days + day.weight);
      } else {
        byLabel.set(year.label, { year, days: roundDays(day.weight) });
      }
    }
    return [...byLabel.values()].sort((a, b) => a.year.label - b.year.label);
  }

  /**
   * Ensures enough remaining balance exists for each leave-year bucket.
   */
  async assertSufficientBalance(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    days: number,
    companyId: string,
  ): Promise<void> {
    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const leaveYear = leaveYearByLabel(calendar, year);
    await this.assertSufficientBalanceForYear(
      employeeId,
      companyId,
      leaveType,
      leaveYear,
      days,
    );
  }

  /**
   * Validates each leave-year segment of a request against getLeaveBalance.
   */
  async assertSufficientBalanceForCharges(
    employeeId: string,
    companyId: string,
    leaveType: LeaveType,
    charges: LeaveYearCharge[],
  ): Promise<void> {
    if (!leaveTypeAffectsBalance(leaveType)) {
      return;
    }
    for (const charge of charges) {
      await this.assertSufficientBalanceForYear(
        employeeId,
        companyId,
        leaveType,
        charge.year,
        charge.days,
      );
    }
  }

  private async assertSufficientBalanceForYear(
    employeeId: string,
    companyId: string,
    leaveType: LeaveType,
    year: LeaveYear,
    days: number,
  ): Promise<void> {
    const balanceLeaveType = resolveBalanceLeaveType(leaveType);
    const balance = await this.getLeaveBalance(
      employeeId,
      companyId,
      balanceLeaveType,
      year.start,
    );
    const requested = roundDays(days);
    const available = roundDays(balance.remaining);
    if (requested > available) {
      const typeLabel = balanceLeaveType
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      throw new BadRequestException(
        `Insufficient leave balance for ${typeLabel} in leave year ${formatLeaveYearRange(year)}. Remaining: ${available}, requested: ${requested}`,
      );
    }
  }

  /**
   * Balance import: entitled + broughtForward become an OPENING_BALANCE (empty
   * year) or an ADJUSTMENT for the difference - never an in-place overwrite.
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

    const calendar = await this.leaveLedger.leaveCalendar(employeeId, companyId);
    const leaveYear = leaveYearByLabel(calendar, year);
    const balance = await this.getLeaveBalance(
      employeeId,
      companyId,
      leaveType,
      leaveYear.start,
    );

    return {
      created: result.created,
      balance: this.mapLedgerBalance(balance),
    };
  }

  private mapLedgerBalance(row: {
    employeeId: string;
    leaveType: LeaveType;
    year: number;
    leaveYearStart: string;
    leaveYearEnd: string;
    entitled: number;
    broughtForward: number;
    used: number;
    pending: number;
    remaining: number;
  }): Record<string, unknown> {
    return {
      // Stable client key (cache row id is not required for display/validation).
      id: `${row.employeeId}:${row.year}:${row.leaveType}`,
      employeeId: row.employeeId,
      year: row.year,
      leaveType: row.leaveType,
      leaveYearStart: row.leaveYearStart,
      leaveYearEnd: row.leaveYearEnd,
      entitled: row.entitled,
      broughtForward: row.broughtForward,
      used: row.used,
      pending: row.pending,
      remaining: row.remaining,
    };
  }

  /** Map a leave_balance cache row (list endpoint; synced via ensureBalance). */
  private mapCacheBalance(row: {
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
    };
  }
}
