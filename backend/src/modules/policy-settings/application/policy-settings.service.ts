import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../audit/application/services/audit.service';
import { SYSTEM_ADMINISTRATOR_ROLE } from '../../../shared/constants/protected-accounts';
import {
  POLICY_DEFAULTS,
  POLICY_DEFINITIONS,
  policyDefinition,
  validateAgainstSnapshot,
  type PolicyDefinition,
  type PolicyKey,
} from '../../../shared/policy/policy-definitions';
import {
  invalidatePolicyCache,
  policyMonthStart,
  resolvePolicyValues,
  type PolicyVersionRow,
} from '../../../shared/policy/policy-reader.util';
import { todayInAddisUtc } from '../../../shared/employment/separation-dates.util';

type Ctx = { companyId: string; userId: string };

export const HR_MANAGER_ROLE = 'HR Manager';
const OPEN_RUN_STATUSES = ['DRAFT', 'REVIEWED', 'SUBMITTED'] as const;
const LOCKED_RUN_STATUSES = ['APPROVED', 'GM_APPROVED', 'PAID'] as const;

export interface AffectedRun {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  status: string;
  effect: 'STALE' | 'REVIEW_REQUIRED';
}

export interface PolicyHistoryItem {
  id: string;
  effectiveFrom: string;
  value: unknown;
  previousValue: unknown;
  reason: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface PolicyListItem {
  key: PolicyKey;
  group: PolicyDefinition['group'];
  kind: PolicyDefinition['kind'];
  options: readonly string[] | null;
  adminOnly: boolean;
  informational: boolean;
  locked: boolean;
  /** Takes effect when saved (no effective month, no payroll impact). */
  immediate: boolean;
  defaultValue: unknown;
  currentValue: unknown;
  currentSource: 'DEFAULT' | 'SETTING';
  scheduled: Array<{ effectiveFrom: string; value: unknown }>;
  history: PolicyHistoryItem[];
}

export interface SavePolicyInput {
  value: unknown;
  /** YYYY-MM-01 */
  effectiveFrom: string;
  reason: string;
  /** Required when the change reaches months that already have payroll runs. */
  confirmAffectedRuns?: boolean;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);

/** Policy settings: effective-dated, append-only versions per key. */
@Injectable()
export class PolicySettingsService {
  private readonly logger = new Logger(PolicySettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: Ctx): Promise<{
    canEdit: boolean;
    canEditAdminOnly: boolean;
    currentMonth: string;
    items: PolicyListItem[];
  }> {
    const [rows, roles] = await Promise.all([this.rows(ctx.companyId), this.roleNames(ctx)]);
    const currentMonth = policyMonthStart(todayInAddisUtc());
    const current = resolvePolicyValues(rows, currentMonth);
    const authorIds = [...new Set(rows.map((r) => r.createdById))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const authorById = new Map(
      authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]),
    );

    const items = POLICY_DEFINITIONS.map((definition): PolicyListItem => {
      const keyRows = rows.filter((r) => r.key === definition.key);
      const inForce = keyRows.some((r) => r.effectiveFrom.getTime() <= currentMonth.getTime());
      const history = [...keyRows]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((row) => {
          const earlier = rows.filter((r) => r.createdAt.getTime() < row.createdAt.getTime());
          return {
            id: row.id,
            effectiveFrom: ymd(row.effectiveFrom),
            value: row.value,
            previousValue: resolvePolicyValues(earlier, row.effectiveFrom)[definition.key],
            reason: row.reason,
            createdAt: row.createdAt.toISOString(),
            createdBy: authorById.has(row.createdById)
              ? { id: row.createdById, name: authorById.get(row.createdById)! }
              : null,
          };
        });
      const scheduled = [...keyRows]
        .filter((r) => r.effectiveFrom.getTime() > currentMonth.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
        .map((r) => ({ effectiveFrom: ymd(r.effectiveFrom), value: r.value }));
      return {
        key: definition.key,
        group: definition.group,
        kind: definition.kind,
        options: definition.options ?? null,
        adminOnly: definition.adminOnly,
        informational: definition.informational ?? false,
        locked: definition.locked ?? false,
        immediate: definition.immediate ?? false,
        defaultValue: POLICY_DEFAULTS[definition.key],
        currentValue: current[definition.key],
        currentSource: inForce ? 'SETTING' : 'DEFAULT',
        scheduled,
        history,
      };
    });

    return {
      canEdit: this.canEdit(roles),
      canEditAdminOnly: roles.includes(SYSTEM_ADMINISTRATOR_ROLE),
      currentMonth: ymd(currentMonth),
      items,
    };
  }

  async preview(ctx: Ctx, key: string, effectiveFromRaw: string): Promise<{ affectedRuns: AffectedRun[] }> {
    const definition = this.requireDefinition(key);
    if (definition.immediate) {
      return { affectedRuns: [] };
    }
    const effectiveFrom = this.parseEffectiveFrom(effectiveFromRaw);
    return { affectedRuns: await this.affectedRuns(ctx.companyId, definition, effectiveFrom) };
  }

  async save(ctx: Ctx, key: string, input: SavePolicyInput): Promise<PolicyListItem> {
    const definition = this.requireDefinition(key);
    const roles = await this.roleNames(ctx);
    if (!this.canEdit(roles)) {
      throw new ForbiddenException('Only an HR Manager or System Administrator can change policies');
    }
    if (definition.adminOnly && !roles.includes(SYSTEM_ADMINISTRATOR_ROLE)) {
      throw new ForbiddenException('Only a System Administrator can change this policy');
    }
    if (definition.locked) {
      throw new BadRequestException('This policy is fixed and cannot be changed yet');
    }
    const reason = input.reason?.trim() ?? '';
    if (reason.length < 3) {
      throw new BadRequestException('A reason is required');
    }
    // Immediate keys: dated to the current month so the next read sees them;
    // the latest version in a month wins (createdAt tie-break).
    const effectiveFrom = definition.immediate
      ? policyMonthStart(todayInAddisUtc())
      : this.parseEffectiveFrom(input.effectiveFrom);
    const error = definition.validate(input.value);
    if (error) {
      throw new BadRequestException(`${definition.key}: ${error}`);
    }
    const rows = await this.rows(ctx.companyId);
    const snapshot = resolvePolicyValues(rows, effectiveFrom);
    const crossError = validateAgainstSnapshot(definition.key, input.value, snapshot);
    if (crossError) {
      throw new BadRequestException(`${definition.key}: ${crossError}`);
    }

    const affected = definition.immediate
      ? []
      : await this.affectedRuns(ctx.companyId, definition, effectiveFrom);
    if (affected.length > 0 && !input.confirmAffectedRuns) {
      throw new ConflictException({
        message:
          'This change reaches months that already have payroll runs. Confirm to save: open runs are marked stale, approved/paid runs are marked "review required". Nothing is recalculated automatically.',
        code: 'POLICY_AFFECTS_PAYROLL_RUNS',
        affectedRuns: affected,
      });
    }

    const previousValue = snapshot[definition.key];
    const created = await this.prisma.policySetting.create({
      data: {
        companyId: ctx.companyId,
        key: definition.key,
        value: input.value as Prisma.InputJsonValue,
        effectiveFrom,
        reason,
        createdById: ctx.userId,
      },
    });
    invalidatePolicyCache(this.prisma, ctx.companyId);
    await this.markAffectedRuns(affected, definition.key, ymd(effectiveFrom));

    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'policy_settings',
        action: 'update',
        recordType: 'policy_setting',
        recordId: created.id,
        beforeValue: { key: definition.key, value: previousValue } as Prisma.InputJsonValue,
        afterValue: {
          key: definition.key,
          value: input.value,
          effectiveFrom: ymd(effectiveFrom),
          reason,
          affectedRuns: affected.map((r) => `${r.runNumber} (${r.effect})`),
        } as Prisma.InputJsonValue,
      }),
    );
    this.logger.log(
      `[PolicySettings] ${definition.key} from ${ymd(effectiveFrom)} saved by ${ctx.userId}; ${affected.length} run(s) affected`,
    );

    const list = await this.list(ctx);
    return list.items.find((i) => i.key === definition.key)!;
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private canEdit(roles: readonly string[]): boolean {
    return roles.includes(HR_MANAGER_ROLE) || roles.includes(SYSTEM_ADMINISTRATOR_ROLE);
  }

  private async roleNames(ctx: Ctx): Promise<string[]> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        role: { companyId: ctx.companyId, deletedAt: null },
      },
      select: { role: { select: { name: true } } },
    });
    return assignments.map((a) => a.role.name);
  }

  private async rows(companyId: string): Promise<Array<PolicyVersionRow & { id: string; reason: string; createdById: string }>> {
    return this.prisma.policySetting.findMany({
      where: { companyId },
      select: {
        id: true,
        key: true,
        value: true,
        effectiveFrom: true,
        reason: true,
        createdById: true,
        createdAt: true,
      },
    });
  }

  private requireDefinition(key: string): PolicyDefinition {
    const definition = policyDefinition(key);
    if (!definition) {
      throw new BadRequestException(`Unknown policy "${key}"`);
    }
    return definition;
  }

  private parseEffectiveFrom(raw: string): Date {
    const match = /^(\d{4})-(\d{2})-01$/.exec(raw ?? '');
    if (!match) {
      throw new BadRequestException('effectiveFrom must be the first day of a month (YYYY-MM-01)');
    }
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw new BadRequestException('effectiveFrom has an invalid month');
    }
    return new Date(Date.UTC(Number(match[1]), month - 1, 1));
  }

  /**
   * Runs in months this version would govern: from effectiveFrom up to (not
   * including) the next later version of the same key. Informational policies
   * are not read by any calculation yet, so they affect no runs.
   */
  private async affectedRuns(
    companyId: string,
    definition: PolicyDefinition,
    effectiveFrom: Date,
  ): Promise<AffectedRun[]> {
    if (definition.informational) return [];
    const nextVersion = await this.prisma.policySetting.findFirst({
      where: { companyId, key: definition.key, effectiveFrom: { gt: effectiveFrom } },
      orderBy: { effectiveFrom: 'asc' },
      select: { effectiveFrom: true },
    });
    const from = monthIndex(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth() + 1);
    const until = nextVersion
      ? monthIndex(nextVersion.effectiveFrom.getUTCFullYear(), nextVersion.effectiveFrom.getUTCMonth() + 1)
      : Number.POSITIVE_INFINITY;
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: [...OPEN_RUN_STATUSES, ...LOCKED_RUN_STATUSES] },
      },
      select: { id: true, runNumber: true, month: true, year: true, status: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return runs
      .filter((r) => {
        const idx = monthIndex(r.year, r.month);
        return idx >= from && idx < until;
      })
      .map((r) => ({
        ...r,
        effect: (LOCKED_RUN_STATUSES as readonly string[]).includes(r.status)
          ? 'REVIEW_REQUIRED'
          : 'STALE',
      }));
  }

  private async markAffectedRuns(runs: AffectedRun[], key: string, effectiveFrom: string): Promise<void> {
    const stale = runs.filter((r) => r.effect === 'STALE').map((r) => r.id);
    const review = runs.filter((r) => r.effect === 'REVIEW_REQUIRED').map((r) => r.id);
    if (stale.length > 0) {
      await this.prisma.payrollRun.updateMany({
        where: { id: { in: stale } },
        data: { attendanceSnapshotStale: true },
      });
    }
    if (review.length > 0) {
      await this.prisma.payrollRun.updateMany({
        where: { id: { in: review } },
        data: {
          policyReviewRequired: true,
          policyReviewNote: `Policy "${key}" changed from ${effectiveFrom}. Review this run; it was not recalculated.`,
        },
      });
    }
  }
}
