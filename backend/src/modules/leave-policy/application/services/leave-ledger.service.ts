import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveBalanceEntryKind,
  LeaveType,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { AuditService } from '../../../audit/application/services/audit.service';
import {
  dateOnlyKey,
  fullServiceYears,
  isEmploymentAnniversary,
  leaveYearByLabel,
  leaveYearFor,
  planCarryOver,
  roundDays,
  toDateOnlyUtc,
  type LeaveYear,
} from '../utils/leave-year.util';
import {
  entitlementFromPolicyRule,
  getBalanceLeaveType,
  POLICY_BALANCE_LEAVE_TYPES,
  type PolicyRuleRow,
} from '../utils/leave-entitlement.util';

/** Entitlement when the employee has no leave policy (legacy defaults). */
export const DEFAULT_ENTITLEMENTS: Partial<Record<LeaveType, number>> = {
  [LeaveType.ANNUAL]: 20,
  [LeaveType.SICK]: 10,
};

/** Only annual leave carries over between leave years. */
const CARRY_OVER_LEAVE_TYPES: LeaveType[] = [LeaveType.ANNUAL];

type Db = PrismaClient | Prisma.TransactionClient;

interface LedgerEmployee {
  id: string;
  companyId: string;
  /** Leave-year anchor: employmentDate, else first contract start, else none (calendar). */
  anchor: Date | null;
  excluded: boolean;
  policyId: string | null;
  rules: Map<LeaveType, PolicyRuleRow>;
}

export interface LedgerEntryView {
  id: string;
  leaveType: LeaveType;
  leaveYearStart: string;
  leaveYearEnd: string;
  kind: LeaveBalanceEntryKind;
  days: number;
  reason: string | null;
  sourceContractId: string | null;
  sourceLeaveRequestId: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: Date;
}

export interface LeaveYearView {
  label: number;
  start: string;
  end: string;
}

function toLeaveYearView(year: LeaveYear): LeaveYearView {
  return {
    label: year.label,
    start: dateOnlyKey(year.start),
    end: dateOnlyKey(year.end),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** True when `value` is a non-zero multiple of 0.5. */
export function isHalfDayStep(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/**
 * Leave balance ledger. Entries are append-only (system entries generated
 * from a contract may be recomputed when that contract changes). The
 * leave_balance row for (employee, leave-year label, type) is a cache:
 *   entitled = ENTITLEMENT + OPENING_BALANCE + ADJUSTMENT + EXPIRED
 *   broughtForward = CARRY_OVER, used = −USED; pending stays on the row.
 */
@Injectable()
export class LeaveLedgerService {
  private readonly logger = new Logger(LeaveLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Leave year resolution ────────────────────────────────────────────────

  async leaveYearForDate(
    employeeId: string,
    companyId: string,
    date: Date,
  ): Promise<LeaveYear> {
    const employee = await this.loadEmployee(employeeId, companyId);
    return leaveYearFor(employee.anchor, date);
  }

  /** leave_balance.year label for the leave year containing `date`. */
  async yearLabelForDate(
    employeeId: string,
    companyId: string,
    date: Date,
  ): Promise<number> {
    return (await this.leaveYearForDate(employeeId, companyId, date)).label;
  }

  async currentYearLabel(employeeId: string, companyId: string): Promise<number> {
    return this.yearLabelForDate(employeeId, companyId, new Date());
  }

  // ─── Opening a leave year (entitlement + carry-over / expiry) ─────────────

  /**
   * Lazy path (balance reads): for the current leave year only, grants the
   * entitlement when the year has no ENTITLEMENT / OPENING_BALANCE entry and
   * no non-zero legacy cache row, and closes the previous year. Past and
   * future years are never filled in on read. Ensures cache rows exist for
   * every leave type.
   */
  async ensureLeaveYear(
    employeeId: string,
    companyId: string,
    label: number,
  ): Promise<void> {
    const employee = await this.loadEmployee(employeeId, companyId);
    const year = leaveYearByLabel(employee.anchor, label);
    const isCurrent = leaveYearFor(employee.anchor, new Date()).label === label;

    if (isCurrent && !employee.excluded) {
      const cacheRows = await this.prisma.leaveBalance.findMany({
        where: { companyId, employeeId, year: label },
        select: {
          leaveType: true,
          entitled: true,
          broughtForward: true,
          used: true,
          pending: true,
        },
      });
      const legacyNonZero = new Set(
        cacheRows
          .filter(
            (row) =>
              Number(row.entitled) !== 0 ||
              Number(row.broughtForward) !== 0 ||
              Number(row.used) !== 0 ||
              Number(row.pending) !== 0,
          )
          .map((row) => row.leaveType),
      );
      const lazyTypes = POLICY_BALANCE_LEAVE_TYPES.filter(
        (type) => !legacyNonZero.has(type),
      );
      if (lazyTypes.length > 0) {
        await this.openLeaveYear(employee, year, {
          leaveTypes: lazyTypes,
          sourceContractId: null,
          actorUserId: null,
          reason: 'Leave year opened',
        });
      }
    }

    await this.syncCache(employee, year, Object.values(LeaveType));
  }

  /**
   * Contract hook: a contract created/activated that supersedes another and
   * starts on an employment anniversary opens a new leave year (renewal).
   * A mid-year change grants nothing. Idempotent per leave year.
   */
  async onContractActivated(
    contractId: string,
    actorUserId: string | null,
  ): Promise<{ renewal: boolean; leaveYear: LeaveYearView | null }> {
    const contract = await this.prisma.employeeContract.findFirst({
      where: activeOnly({ id: contractId }),
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        startDate: true,
      },
    });
    if (!contract) {
      return { renewal: false, leaveYear: null };
    }
    const supersedes = await this.prisma.employeeContract.count({
      where: activeOnly({
        companyId: contract.companyId,
        employeeId: contract.employeeId,
        id: { not: contract.id },
        startDate: { lt: contract.startDate },
      }),
    });
    if (supersedes === 0) {
      return { renewal: false, leaveYear: null };
    }

    const employee = await this.loadEmployee(
      contract.employeeId,
      contract.companyId,
    );
    if (
      employee.excluded ||
      !isEmploymentAnniversary(employee.anchor, contract.startDate)
    ) {
      return { renewal: false, leaveYear: null };
    }

    const year = leaveYearFor(employee.anchor, contract.startDate);
    await this.openLeaveYear(employee, year, {
      leaveTypes: POLICY_BALANCE_LEAVE_TYPES,
      sourceContractId: contract.id,
      actorUserId,
      reason: 'Contract renewal on employment anniversary',
    });
    return { renewal: true, leaveYear: toLeaveYearView(year) };
  }

  /**
   * Contract dates changed or contract removed: drop only the entries this
   * contract generated, then re-run the renewal rule for it.
   */
  async recomputeContractEntries(
    contractId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const entries = await this.prisma.leaveBalanceEntry.findMany({
      where: { sourceContractId: contractId },
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        leaveYearStart: true,
        leaveType: true,
      },
    });
    if (entries.length > 0) {
      await this.prisma.leaveBalanceEntry.deleteMany({
        where: { sourceContractId: contractId },
      });
    }
    await this.onContractActivated(contractId, actorUserId);

    const touched = new Map<string, { companyId: string; employeeId: string; start: Date }>();
    for (const entry of entries) {
      touched.set(`${entry.employeeId}|${dateOnlyKey(entry.leaveYearStart)}`, {
        companyId: entry.companyId,
        employeeId: entry.employeeId,
        start: entry.leaveYearStart,
      });
    }
    for (const row of touched.values()) {
      const employee = await this.loadEmployee(row.employeeId, row.companyId);
      await this.syncCache(
        employee,
        leaveYearFor(employee.anchor, row.start),
        POLICY_BALANCE_LEAVE_TYPES,
      );
      // A year whose renewal no longer applies still needs its entitlement.
      await this.ensureLeaveYear(
        employee.id,
        employee.companyId,
        leaveYearFor(employee.anchor, new Date()).label,
      );
    }
  }

  /**
   * Anniversary cron / policy assignment: open the leave year containing
   * `date` (entitlement + carry-over), regardless of legacy cache rows.
   */
  async openLeaveYearForDate(
    employeeId: string,
    companyId: string,
    date: Date,
    reason: string,
  ): Promise<void> {
    const employee = await this.loadEmployee(employeeId, companyId);
    if (employee.excluded) {
      return;
    }
    const year = leaveYearFor(employee.anchor, date);
    await this.openLeaveYear(employee, year, {
      leaveTypes: POLICY_BALANCE_LEAVE_TYPES,
      sourceContractId: null,
      actorUserId: null,
      reason,
    });
  }

  /**
   * Leave policy assigned or changed: align ENTITLEMENT entries of the
   * current leave year with the policy (a correction entry, never an edit).
   */
  async reconcilePolicyEntitlement(
    employeeId: string,
    companyId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const employee = await this.loadEmployee(employeeId, companyId);
    if (employee.excluded) {
      return;
    }
    const year = leaveYearFor(employee.anchor, new Date());
    for (const leaveType of POLICY_BALANCE_LEAVE_TYPES) {
      const target = this.entitlementFor(employee, leaveType, year);
      const current = await this.sumEntries(employee.id, leaveType, year, [
        LeaveBalanceEntryKind.ENTITLEMENT,
      ]);
      const hasOpening =
        (await this.prisma.leaveBalanceEntry.count({
          where: {
            employeeId: employee.id,
            leaveType,
            leaveYearStart: year.start,
            kind: LeaveBalanceEntryKind.OPENING_BALANCE,
          },
        })) > 0;
      // Migrated / go-live years carry their entitlement in the opening balance.
      if (hasOpening && current === 0) {
        continue;
      }
      const delta = roundDays(target - current);
      if (delta === 0) {
        continue;
      }
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year,
        kind: LeaveBalanceEntryKind.ENTITLEMENT,
        days: delta,
        reason:
          current === 0
            ? `Entitlement (${fullServiceYears(employee.anchor, year.start)} service year(s))`
            : `Leave policy changed: entitlement ${current} → ${target}`,
        dedupeKey: `ENTITLEMENT:${employee.id}:${leaveType}:${dateOnlyKey(year.start)}:policy:${employee.policyId ?? 'none'}:${target}`,
        actorUserId,
      });
    }
    await this.syncCache(employee, year, POLICY_BALANCE_LEAVE_TYPES);
  }

  // ─── Used days (approved leave) ───────────────────────────────────────────

  /** Approved leave → USED (−days) in the leave year of its start date. */
  async recordLeaveUsed(leaveRequestId: string): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveRequestId },
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        leaveType: true,
        startDate: true,
        days: true,
        requestNumber: true,
      },
    });
    if (!leave?.startDate) {
      return;
    }
    const days = Number(leave.days ?? 0);
    if (!(days > 0)) {
      return;
    }
    const employee = await this.loadEmployee(leave.employeeId, leave.companyId);
    const year = leaveYearFor(employee.anchor, leave.startDate);
    const leaveType = getBalanceLeaveType(leave.leaveType);
    await this.createEntry(this.prisma, {
      employee,
      leaveType,
      year,
      kind: LeaveBalanceEntryKind.USED,
      days: -days,
      reason: `Leave ${leave.requestNumber} approved`,
      dedupeKey: `USED:${leave.id}`,
      sourceLeaveRequestId: leave.id,
      actorUserId: null,
    });
    await this.syncCache(employee, year, [leaveType]);
  }

  /** Cancelled / deleted approved leave → reverse its USED entry once. */
  async reverseLeaveUsed(
    leaveRequestId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const used = await this.prisma.leaveBalanceEntry.findUnique({
      where: { dedupeKey: `USED:${leaveRequestId}` },
    });
    if (!used) {
      return;
    }
    const employee = await this.loadEmployee(used.employeeId, used.companyId);
    const year = leaveYearFor(employee.anchor, used.leaveYearStart);
    await this.createEntry(this.prisma, {
      employee,
      leaveType: used.leaveType,
      year,
      kind: LeaveBalanceEntryKind.USED,
      days: -Number(used.days),
      reason: `Reversal: ${used.reason ?? 'leave'} cancelled`,
      dedupeKey: `USED_REVERSAL:${leaveRequestId}`,
      sourceLeaveRequestId: leaveRequestId,
      actorUserId,
    });
    await this.syncCache(employee, year, [used.leaveType]);
  }

  // ─── HR entries ───────────────────────────────────────────────────────────

  /** HR: ±days (0.5 steps) on the current leave year (or `yearLabel`). */
  async addAdjustment(input: {
    employeeId: string;
    companyId: string;
    leaveType: LeaveType;
    days: number;
    reason: string;
    actorUserId: string;
    yearLabel?: number;
  }): Promise<LedgerEntryView> {
    if (!isHalfDayStep(input.days) || input.days === 0) {
      throw new BadRequestException('Days must be a non-zero multiple of 0.5');
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required');
    }
    return this.addHrEntry(
      input,
      LeaveBalanceEntryKind.ADJUSTMENT,
      roundDays(input.days),
      reason,
    );
  }

  /**
   * HR go-live: OPENING_BALANCE for the current leave year — only while the
   * year has no entitlement or opening balance yet (else use an adjustment).
   */
  async setOpeningBalance(input: {
    employeeId: string;
    companyId: string;
    leaveType: LeaveType;
    days: number;
    reason: string;
    actorUserId: string;
  }): Promise<LedgerEntryView> {
    if (!isHalfDayStep(input.days) || input.days < 0) {
      throw new BadRequestException(
        'Opening balance must be zero or more, in 0.5-day steps',
      );
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required');
    }
    const employee = await this.loadEmployee(input.employeeId, input.companyId);
    const year = leaveYearFor(employee.anchor, new Date());
    const existing = await this.prisma.leaveBalanceEntry.count({
      where: {
        employeeId: employee.id,
        leaveType: input.leaveType,
        leaveYearStart: year.start,
        kind: {
          in: [
            LeaveBalanceEntryKind.OPENING_BALANCE,
            LeaveBalanceEntryKind.ENTITLEMENT,
          ],
        },
      },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'This leave year already has an entitlement or opening balance. Use Adjust balance instead.',
      );
    }
    return this.addHrEntry(
      { ...input, yearLabel: year.label },
      LeaveBalanceEntryKind.OPENING_BALANCE,
      roundDays(input.days),
      reason,
    );
  }

  /**
   * HR go-live / correction: set entitled, brought-forward and used for one or
   * more leave types on a leave year. Remaining =
   * entitled + broughtForward − used − pending (pending is left unchanged).
   */
  async setBalanceSnapshot(input: {
    employeeId: string;
    companyId: string;
    yearLabel?: number;
    rows: Array<{
      leaveType: LeaveType;
      entitled: number;
      broughtForward: number;
      used: number;
    }>;
    reason: string;
    actorUserId: string;
  }): Promise<{
    year: LeaveYearView;
    balances: Array<{
      leaveType: LeaveType;
      entitled: number;
      broughtForward: number;
      used: number;
      pending: number;
      remaining: number;
    }>;
  }> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required');
    }
    if (input.rows.length === 0) {
      throw new BadRequestException('At least one leave type row is required');
    }

    const employee = await this.loadEmployee(input.employeeId, input.companyId);
    const year =
      input.yearLabel != null
        ? leaveYearByLabel(employee.anchor, input.yearLabel)
        : leaveYearFor(employee.anchor, new Date());

    const seen = new Set<LeaveType>();
    for (const row of input.rows) {
      if (seen.has(row.leaveType)) {
        throw new BadRequestException(
          `Duplicate leave type in snapshot: ${row.leaveType}`,
        );
      }
      seen.add(row.leaveType);
      if (
        !POLICY_BALANCE_LEAVE_TYPES.includes(row.leaveType) ||
        !isHalfDayStep(row.entitled) ||
        !isHalfDayStep(row.broughtForward) ||
        !isHalfDayStep(row.used) ||
        row.entitled < 0 ||
        row.broughtForward < 0 ||
        row.used < 0
      ) {
        throw new BadRequestException(
          `Invalid balance row for ${row.leaveType}: entitled, broughtForward and used must be ≥ 0 in 0.5-day steps`,
        );
      }
      await this.applyBalanceSnapshotRow({
        employee,
        year,
        leaveType: row.leaveType,
        entitled: roundDays(row.entitled),
        broughtForward: roundDays(row.broughtForward),
        used: roundDays(row.used),
        reason,
        actorUserId: input.actorUserId,
      });
    }

    await this.syncCache(employee, year, Object.values(LeaveType));

    const cacheRows = await this.prisma.leaveBalance.findMany({
      where: {
        companyId: employee.companyId,
        employeeId: employee.id,
        year: year.label,
        leaveType: { in: [...seen] },
      },
    });

    return {
      year: toLeaveYearView(year),
      balances: [...seen].map((leaveType) => {
        const row = cacheRows.find((item) => item.leaveType === leaveType);
        const entitled = Number(row?.entitled ?? 0);
        const broughtForward = Number(row?.broughtForward ?? 0);
        const used = Number(row?.used ?? 0);
        const pending = Number(row?.pending ?? 0);
        return {
          leaveType,
          entitled,
          broughtForward,
          used,
          pending,
          remaining: roundDays(entitled + broughtForward - used - pending),
        };
      }),
    };
  }

  /**
   * Imported balance: absolute entitled / brought-forward / used for a leave year.
   */
  async applyImportedBalance(input: {
    employeeId: string;
    companyId: string;
    leaveType: LeaveType;
    yearLabel: number;
    entitled: number;
    broughtForward: number;
    used?: number;
    actorUserId: string | null;
  }): Promise<{ created: boolean }> {
    const employee = await this.loadEmployee(input.employeeId, input.companyId);
    const year = leaveYearByLabel(employee.anchor, input.yearLabel);
    const entryCount = await this.prisma.leaveBalanceEntry.count({
      where: {
        employeeId: employee.id,
        leaveType: input.leaveType,
        leaveYearStart: year.start,
      },
    });
    await this.applyBalanceSnapshotRow({
      employee,
      year,
      leaveType: input.leaveType,
      entitled: roundDays(input.entitled),
      broughtForward: roundDays(input.broughtForward),
      used: roundDays(input.used ?? 0),
      reason: `Imported balance: entitled ${input.entitled}, brought forward ${input.broughtForward}, used ${input.used ?? 0}`,
      actorUserId: input.actorUserId,
    });
    await this.syncCache(employee, year, Object.values(LeaveType));
    return { created: entryCount === 0 };
  }

  /**
   * Writes absolute entitled (OPENING/ADJUSTMENT), brought-forward (CARRY_OVER)
   * and go-live used (USED without a leave request) for one leave type / year.
   */
  private async applyBalanceSnapshotRow(input: {
    employee: LedgerEmployee;
    year: LeaveYear;
    leaveType: LeaveType;
    entitled: number;
    broughtForward: number;
    used: number;
    reason: string;
    actorUserId: string | null;
  }): Promise<void> {
    const { employee, year, leaveType } = input;
    const yearKey = dateOnlyKey(year.start);

    const currentEntitled = await this.sumEntries(employee.id, leaveType, year, [
      LeaveBalanceEntryKind.ENTITLEMENT,
      LeaveBalanceEntryKind.OPENING_BALANCE,
      LeaveBalanceEntryKind.ADJUSTMENT,
      LeaveBalanceEntryKind.EXPIRED,
    ]);
    const currentBroughtForward = await this.sumEntries(
      employee.id,
      leaveType,
      year,
      [LeaveBalanceEntryKind.CARRY_OVER],
    );
    const systemUsed = roundDays(
      -(
        await this.prisma.leaveBalanceEntry.aggregate({
          where: {
            employeeId: employee.id,
            leaveType,
            leaveYearStart: year.start,
            kind: LeaveBalanceEntryKind.USED,
            sourceLeaveRequestId: { not: null },
          },
          _sum: { days: true },
        })
      )._sum.days ?? 0,
    );
    if (input.used < systemUsed) {
      throw new BadRequestException(
        `${leaveType}: used (${input.used}) cannot be less than days already taken on approved leave requests (${systemUsed})`,
      );
    }

    const entitledDelta = roundDays(input.entitled - currentEntitled);
    if (entitledDelta !== 0 || currentEntitled === 0) {
      const hasSeed = await this.prisma.leaveBalanceEntry.count({
        where: {
          employeeId: employee.id,
          leaveType,
          leaveYearStart: year.start,
          kind: {
            in: [
              LeaveBalanceEntryKind.OPENING_BALANCE,
              LeaveBalanceEntryKind.ENTITLEMENT,
              LeaveBalanceEntryKind.ADJUSTMENT,
            ],
          },
        },
      });
      if (hasSeed === 0) {
        await this.createEntry(this.prisma, {
          employee,
          leaveType,
          year,
          kind: LeaveBalanceEntryKind.OPENING_BALANCE,
          days: input.entitled,
          reason: input.reason,
          dedupeKey: `OPENING:${employee.id}:${leaveType}:${yearKey}`,
          actorUserId: input.actorUserId,
        });
      } else if (entitledDelta !== 0) {
        await this.createEntry(this.prisma, {
          employee,
          leaveType,
          year,
          kind: LeaveBalanceEntryKind.ADJUSTMENT,
          days: entitledDelta,
          reason: input.reason,
          dedupeKey: null,
          actorUserId: input.actorUserId,
        });
      }
    }

    const carryDedupe = `CARRY_OVER:SNAPSHOT:${employee.id}:${leaveType}:${yearKey}`;
    const systemCarry = roundDays(
      (
        await this.prisma.leaveBalanceEntry.aggregate({
          where: {
            employeeId: employee.id,
            leaveType,
            leaveYearStart: year.start,
            kind: LeaveBalanceEntryKind.CARRY_OVER,
            NOT: { dedupeKey: carryDedupe },
          },
          _sum: { days: true },
        })
      )._sum.days ?? 0,
    );
    if (input.broughtForward < systemCarry) {
      throw new BadRequestException(
        `${leaveType}: brought forward (${input.broughtForward}) cannot be less than system carry-over (${systemCarry})`,
      );
    }
    await this.prisma.leaveBalanceEntry.deleteMany({
      where: {
        employeeId: employee.id,
        leaveType,
        leaveYearStart: year.start,
        kind: LeaveBalanceEntryKind.CARRY_OVER,
        dedupeKey: carryDedupe,
      },
    });
    const snapshotCarry = roundDays(input.broughtForward - systemCarry);
    if (snapshotCarry > 0) {
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year,
        kind: LeaveBalanceEntryKind.CARRY_OVER,
        days: snapshotCarry,
        reason: input.reason,
        dedupeKey: carryDedupe,
        actorUserId: input.actorUserId,
      });
    }

    const goLiveUsedTarget = roundDays(input.used - systemUsed);
    const goLiveDedupe = `USED:SNAPSHOT:${employee.id}:${leaveType}:${yearKey}`;
    await this.prisma.leaveBalanceEntry.deleteMany({
      where: {
        employeeId: employee.id,
        leaveType,
        leaveYearStart: year.start,
        kind: LeaveBalanceEntryKind.USED,
        dedupeKey: goLiveDedupe,
      },
    });
    if (goLiveUsedTarget > 0) {
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year,
        kind: LeaveBalanceEntryKind.USED,
        days: -goLiveUsedTarget,
        reason: input.reason,
        dedupeKey: goLiveDedupe,
        actorUserId: input.actorUserId,
      });
    }
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async listEntries(
    employeeId: string,
    companyId: string,
    yearLabel?: number,
  ): Promise<{
    currentLeaveYear: LeaveYearView;
    leaveYear: LeaveYearView | null;
    entries: LedgerEntryView[];
    totals: Array<{ leaveType: LeaveType; balance: number }>;
  }> {
    const employee = await this.loadEmployee(employeeId, companyId);
    const current = leaveYearFor(employee.anchor, new Date());
    const year =
      yearLabel != null ? leaveYearByLabel(employee.anchor, yearLabel) : null;
    const rows = await this.prisma.leaveBalanceEntry.findMany({
      where: {
        companyId,
        employeeId,
        ...(year ? { leaveYearStart: year.start } : {}),
      },
      orderBy: [{ leaveYearStart: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const totals = new Map<LeaveType, number>();
    if (year) {
      for (const row of rows) {
        totals.set(row.leaveType, (totals.get(row.leaveType) ?? 0) + Number(row.days));
      }
    }
    return {
      currentLeaveYear: toLeaveYearView(current),
      leaveYear: year ? toLeaveYearView(year) : null,
      entries: rows.map((row) => this.mapEntry(row)),
      totals: [...totals.entries()].map(([leaveType, balance]) => ({
        leaveType,
        balance: roundDays(balance),
      })),
    };
  }

  /** Sum of all entries for a leave year (the ledger balance). */
  async balance(
    employeeId: string,
    companyId: string,
    leaveType: LeaveType,
    yearLabel: number,
  ): Promise<number> {
    const employee = await this.loadEmployee(employeeId, companyId);
    return this.sumEntries(
      employee.id,
      leaveType,
      leaveYearByLabel(employee.anchor, yearLabel),
    );
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async openLeaveYear(
    employee: LedgerEmployee,
    year: LeaveYear,
    options: {
      leaveTypes: ReadonlyArray<LeaveType>;
      sourceContractId: string | null;
      actorUserId: string | null;
      reason: string;
    },
  ): Promise<void> {
    if (employee.excluded) {
      return;
    }
    const startKey = dateOnlyKey(year.start);
    const serviceYears = fullServiceYears(employee.anchor, year.start);

    for (const leaveType of options.leaveTypes) {
      const hasEntitlement =
        (await this.prisma.leaveBalanceEntry.count({
          where: {
            employeeId: employee.id,
            leaveType,
            leaveYearStart: year.start,
            kind: {
              in: [
                LeaveBalanceEntryKind.ENTITLEMENT,
                LeaveBalanceEntryKind.OPENING_BALANCE,
              ],
            },
          },
        })) > 0;
      if (!hasEntitlement) {
        await this.createEntry(this.prisma, {
          employee,
          leaveType,
          year,
          kind: LeaveBalanceEntryKind.ENTITLEMENT,
          days: this.entitlementFor(employee, leaveType, year),
          reason: `${options.reason} — ${serviceYears} service year(s)`,
          dedupeKey: `ENTITLEMENT:${employee.id}:${leaveType}:${startKey}`,
          sourceContractId: options.sourceContractId,
          actorUserId: options.actorUserId,
        });
      }

      if (CARRY_OVER_LEAVE_TYPES.includes(leaveType)) {
        await this.closePreviousYear(employee, leaveType, year, options);
      }
    }
    await this.syncCache(employee, year, options.leaveTypes);
  }

  /**
   * Previous leave year: unused days up to the cap move to `year`
   * (CARRY_OVER −/+), the rest EXPIRED. Pending days are not carried.
   */
  private async closePreviousYear(
    employee: LedgerEmployee,
    leaveType: LeaveType,
    year: LeaveYear,
    options: { sourceContractId: string | null; actorUserId: string | null },
  ): Promise<void> {
    const previous = leaveYearByLabel(employee.anchor, year.label - 1);
    const prevKey = dateOnlyKey(previous.start);
    const carryInKey = `CARRY_IN:${employee.id}:${leaveType}:${dateOnlyKey(year.start)}`;
    const already = await this.prisma.leaveBalanceEntry.findUnique({
      where: { dedupeKey: carryInKey },
      select: { id: true },
    });
    const expiredKey = `EXPIRED:${employee.id}:${leaveType}:${prevKey}`;
    const alreadyExpired = await this.prisma.leaveBalanceEntry.findUnique({
      where: { dedupeKey: expiredKey },
      select: { id: true },
    });
    if (already || alreadyExpired) {
      return;
    }
    const previousEntries = await this.prisma.leaveBalanceEntry.count({
      where: { employeeId: employee.id, leaveType, leaveYearStart: previous.start },
    });
    if (previousEntries === 0) {
      return;
    }

    const prevSum = await this.sumEntries(employee.id, leaveType, previous);
    const prevCache = await this.prisma.leaveBalance.findUnique({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId: employee.companyId,
          employeeId: employee.id,
          year: previous.label,
          leaveType,
        },
      },
      select: { pending: true },
    });
    const remaining = prevSum - Number(prevCache?.pending ?? 0);
    const cap = employee.rules.get(leaveType)?.maxCarryForwardDays;
    const plan = planCarryOver(remaining, cap != null ? Number(cap) : null);

    if (plan.carriedIn > 0) {
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year: previous,
        kind: LeaveBalanceEntryKind.CARRY_OVER,
        days: -plan.carriedIn,
        reason: `Carried to leave year starting ${dateOnlyKey(year.start)}`,
        dedupeKey: `CARRY_OUT:${employee.id}:${leaveType}:${prevKey}`,
        sourceContractId: options.sourceContractId,
        actorUserId: options.actorUserId,
      });
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year,
        kind: LeaveBalanceEntryKind.CARRY_OVER,
        days: plan.carriedIn,
        reason: `Carried over from leave year starting ${prevKey}`,
        dedupeKey: carryInKey,
        sourceContractId: options.sourceContractId,
        actorUserId: options.actorUserId,
      });
    }
    if (plan.expired > 0) {
      await this.createEntry(this.prisma, {
        employee,
        leaveType,
        year: previous,
        kind: LeaveBalanceEntryKind.EXPIRED,
        days: -plan.expired,
        reason:
          cap != null
            ? `Expired: beyond carry-over cap of ${Number(cap)} day(s)`
            : 'Expired',
        dedupeKey: expiredKey,
        sourceContractId: options.sourceContractId,
        actorUserId: options.actorUserId,
      });
    }
    await this.syncCache(employee, previous, [leaveType]);
  }

  private entitlementFor(
    employee: LedgerEmployee,
    leaveType: LeaveType,
    year: LeaveYear,
  ): number {
    if (!employee.policyId) {
      return DEFAULT_ENTITLEMENTS[leaveType] ?? 0;
    }
    const rule = employee.rules.get(leaveType);
    if (!rule) {
      return 0;
    }
    return entitlementFromPolicyRule(
      rule,
      fullServiceYears(employee.anchor, year.start),
    );
  }

  private async addHrEntry(
    input: {
      employeeId: string;
      companyId: string;
      leaveType: LeaveType;
      actorUserId: string;
      yearLabel?: number;
    },
    kind: LeaveBalanceEntryKind,
    days: number,
    reason: string,
  ): Promise<LedgerEntryView> {
    if (!POLICY_BALANCE_LEAVE_TYPES.includes(input.leaveType)) {
      throw new BadRequestException(
        `Leave type ${input.leaveType} has no balance of its own`,
      );
    }
    const employee = await this.loadEmployee(input.employeeId, input.companyId);
    const year =
      input.yearLabel != null
        ? leaveYearByLabel(employee.anchor, input.yearLabel)
        : leaveYearFor(employee.anchor, new Date());
    const before = await this.sumEntries(employee.id, input.leaveType, year);
    const created = await this.createEntry(this.prisma, {
      employee,
      leaveType: input.leaveType,
      year,
      kind,
      days,
      reason,
      dedupeKey: null,
      actorUserId: input.actorUserId,
    });
    await this.syncCache(employee, year, [input.leaveType]);
    if (!created) {
      throw new ForbiddenException('Could not record the balance entry');
    }
    await this.audit.create({
      userId: input.actorUserId,
      companyId: input.companyId,
      module: 'leave',
      action: kind === LeaveBalanceEntryKind.OPENING_BALANCE ? 'SET_OPENING_BALANCE' : 'ADJUST_BALANCE',
      recordType: 'LeaveBalanceEntry',
      recordId: created.id,
      recordReference: `${input.leaveType} ${dateOnlyKey(year.start)}`,
      beforeValue: { employeeId: employee.id, balance: before },
      afterValue: {
        employeeId: employee.id,
        balance: roundDays(before + days),
        days,
        kind,
        reason,
      },
    });
    const row = await this.prisma.leaveBalanceEntry.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return this.mapEntry(row);
  }

  /** Creates an entry; a duplicate dedupeKey is a no-op (returns null). */
  private async createEntry(
    db: Db,
    input: {
      employee: LedgerEmployee;
      leaveType: LeaveType;
      year: LeaveYear;
      kind: LeaveBalanceEntryKind;
      days: number;
      reason: string | null;
      dedupeKey: string | null;
      sourceContractId?: string | null;
      sourceLeaveRequestId?: string | null;
      actorUserId: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await db.leaveBalanceEntry.create({
        data: {
          id: randomUUID(),
          companyId: input.employee.companyId,
          employeeId: input.employee.id,
          leaveType: input.leaveType,
          leaveYearStart: input.year.start,
          leaveYearEnd: input.year.end,
          kind: input.kind,
          days: new Prisma.Decimal(roundDays(input.days)),
          reason: input.reason,
          dedupeKey: input.dedupeKey,
          sourceContractId: input.sourceContractId ?? null,
          sourceLeaveRequestId: input.sourceLeaveRequestId ?? null,
          createdById: input.actorUserId,
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (input.dedupeKey && isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  private async sumEntries(
    employeeId: string,
    leaveType: LeaveType,
    year: LeaveYear,
    kinds?: LeaveBalanceEntryKind[],
  ): Promise<number> {
    const result = await this.prisma.leaveBalanceEntry.aggregate({
      where: {
        employeeId,
        leaveType,
        leaveYearStart: year.start,
        ...(kinds ? { kind: { in: kinds } } : {}),
      },
      _sum: { days: true },
    });
    return roundDays(Number(result._sum.days ?? 0));
  }

  /** Rewrites the leave_balance cache rows from ledger sums (pending kept). */
  async syncCache(
    employee: LedgerEmployee,
    year: LeaveYear,
    leaveTypes: ReadonlyArray<LeaveType>,
  ): Promise<void> {
    const grouped = await this.prisma.leaveBalanceEntry.groupBy({
      by: ['leaveType', 'kind'],
      where: {
        employeeId: employee.id,
        leaveYearStart: year.start,
        leaveType: { in: [...leaveTypes] },
      },
      _sum: { days: true },
    });
    for (const leaveType of leaveTypes) {
      const sum = (kinds: LeaveBalanceEntryKind[]): number =>
        roundDays(
          grouped
            .filter((row) => row.leaveType === leaveType && kinds.includes(row.kind))
            .reduce((total, row) => total + Number(row._sum.days ?? 0), 0),
        );
      const entitled = sum([
        LeaveBalanceEntryKind.ENTITLEMENT,
        LeaveBalanceEntryKind.OPENING_BALANCE,
        LeaveBalanceEntryKind.ADJUSTMENT,
        LeaveBalanceEntryKind.EXPIRED,
      ]);
      const broughtForward = sum([LeaveBalanceEntryKind.CARRY_OVER]);
      const used = roundDays(-sum([LeaveBalanceEntryKind.USED]));
      await this.prisma.leaveBalance.upsert({
        where: {
          companyId_employeeId_year_leaveType: {
            companyId: employee.companyId,
            employeeId: employee.id,
            year: year.label,
            leaveType,
          },
        },
        create: {
          id: randomUUID(),
          companyId: employee.companyId,
          employeeId: employee.id,
          year: year.label,
          leaveType,
          entitled: new Prisma.Decimal(entitled),
          broughtForward: new Prisma.Decimal(broughtForward),
          used: new Prisma.Decimal(used),
          pending: new Prisma.Decimal(0),
        },
        update: {
          entitled: new Prisma.Decimal(entitled),
          broughtForward: new Prisma.Decimal(broughtForward),
          used: new Prisma.Decimal(used),
        },
      });
    }
  }

  async loadEmployee(employeeId: string, companyId: string): Promise<LedgerEmployee> {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        employmentDate: true,
        excludedFromHrProcesses: true,
        leavePolicyId: true,
        leavePolicy: {
          where: activeOnly({ isActive: true }),
          include: { rules: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Employee not found in this company');
    }
    let anchor = user.employmentDate;
    if (!anchor) {
      const firstContract = await this.prisma.employeeContract.findFirst({
        where: activeOnly({ companyId, employeeId }),
        orderBy: { startDate: 'asc' },
        select: { startDate: true },
      });
      anchor = firstContract?.startDate ?? null;
    }
    return {
      id: user.id,
      companyId: user.companyId,
      anchor: anchor ? toDateOnlyUtc(anchor) : null,
      excluded: user.excludedFromHrProcesses === true,
      policyId: user.leavePolicy ? user.leavePolicyId : null,
      rules: new Map(
        (user.leavePolicy?.rules ?? []).map((rule) => [rule.leaveType, rule]),
      ),
    };
  }

  private mapEntry(row: {
    id: string;
    leaveType: LeaveType;
    leaveYearStart: Date;
    leaveYearEnd: Date;
    kind: LeaveBalanceEntryKind;
    days: Prisma.Decimal;
    reason: string | null;
    sourceContractId: string | null;
    sourceLeaveRequestId: string | null;
    createdAt: Date;
    createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
  }): LedgerEntryView {
    return {
      id: row.id,
      leaveType: row.leaveType,
      leaveYearStart: dateOnlyKey(row.leaveYearStart),
      leaveYearEnd: dateOnlyKey(row.leaveYearEnd),
      kind: row.kind,
      days: Number(row.days),
      reason: row.reason,
      sourceContractId: row.sourceContractId,
      sourceLeaveRequestId: row.sourceLeaveRequestId,
      createdBy: row.createdBy
        ? {
            id: row.createdBy.id,
            name: [row.createdBy.firstName, row.createdBy.lastName]
              .filter((part) => Boolean(part && part.trim()))
              .join(' '),
          }
        : null,
      createdAt: row.createdAt,
    };
  }
}
