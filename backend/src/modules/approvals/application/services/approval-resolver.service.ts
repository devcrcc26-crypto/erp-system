import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  isVacantApprover,
  vacantApproverMessage,
} from '../../../../shared/employment/vacant-approver.util';

/** Single tier definition inside an approval rule. */
export interface ApprovalRuleTierConfig {
  label: string;
  resolver: string;
  userId?: string;
  roleId?: string;
  /** Role name or id - preferred seed field. */
  roleCode?: string;
  /** Alias for roleCode (e.g. MANAGER, FINANCE, or a seeded Role.name). */
  role?: string;
  /** Optional explicit order; array index is used when omitted. */
  order?: number;
}

/** Maps short role aliases used in category seeds to seeded Role.name values. */
const ROLE_ALIASES: Record<string, string> = {
  MANAGER: 'Project Manager',
  PROJECT_MANAGER: 'Project Manager',
  DEPARTMENT_HEAD: 'Project Manager',
  HR: 'HR Officer',
  HR_MANAGER: 'HR Officer',
  FINANCE: 'Finance Manager',
  FINANCE_MANAGER: 'Finance Manager',
  DIRECTOR: 'Managing Director',
  GENERAL_MANAGER: 'General Manager',
  PROCUREMENT: 'Procurement Officer',
  LEGAL: 'Document Controller',
  ADMIN_MANAGER: 'Document Controller',
  SAFETY: 'Safety Officer',
  STORE: 'Storekeeper',
  WAREHOUSE_MANAGER: 'Storekeeper',
  ACCOUNTANT: 'Accountant',
  SITE: 'Site Engineer',
  EMPLOYEE: 'Employee',
};

/** Rule matched against formData to produce a tier chain. */
export interface ApprovalRuleConfig {
  name: string;
  when?: Record<string, unknown>;
  tiers: ApprovalRuleTierConfig[];
}

export interface ResolvedApprovalTier {
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
}

export interface MatchedApprovalRule {
  ruleName: string;
  tiers: ResolvedApprovalTier[];
}

/**
 * Resolves approvers from category approval rules (role / user / department leader).
 */
@Injectable()
export class ApprovalResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches the first applicable rule and resolves concrete approver user ids.
   */
  async resolveRule(
    companyId: string,
    submitterId: string,
    approvalRules: unknown,
    formData: Record<string, unknown>,
  ): Promise<MatchedApprovalRule> {
    const rules = this.parseRules(approvalRules);
    if (rules.length === 0) {
      throw new BadRequestException(
        'Category has no approval rules configured',
      );
    }

    const matched = rules.find((rule) => this.matchesWhen(rule.when, formData));
    if (!matched) {
      throw new BadRequestException(
        'No approval rule matched the submitted form data',
      );
    }

    if (!matched.tiers || matched.tiers.length === 0) {
      throw new BadRequestException(
        `Approval rule "${matched.name}" has no tiers`,
      );
    }

    const sortedTiers = [...matched.tiers].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return matched.tiers.indexOf(a) - matched.tiers.indexOf(b);
    });

    const tiers: ResolvedApprovalTier[] = [];
    for (let i = 0; i < sortedTiers.length; i += 1) {
      const tierConfig = sortedTiers[i];
      const approverId = await this.resolveApprover(
        companyId,
        submitterId,
        tierConfig,
      );
      tiers.push({
        tierOrder: i + 1,
        label: tierConfig.label?.trim() || `Tier ${i + 1}`,
        approverId,
        resolver: tierConfig.resolver,
      });
    }

    return { ruleName: matched.name, tiers };
  }

  private parseRules(raw: unknown): ApprovalRuleConfig[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.filter((item): item is ApprovalRuleConfig => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const rule = item as ApprovalRuleConfig;
      return typeof rule.name === 'string' && Array.isArray(rule.tiers);
    });
  }

  private matchesWhen(
    when: Record<string, unknown> | undefined,
    formData: Record<string, unknown>,
  ): boolean {
    if (!when || Object.keys(when).length === 0) {
      return true;
    }

    return Object.entries(when).every(([key, expected]) => {
      const actual = formData[key];
      if (
        expected !== null &&
        typeof expected === 'object' &&
        !Array.isArray(expected)
      ) {
        return this.matchesComparison(
          actual,
          expected as Record<string, unknown>,
        );
      }
      return actual === expected;
    });
  }

  private matchesComparison(
    actual: unknown,
    ops: Record<string, unknown>,
  ): boolean {
    const numericActual = Number(actual);
    const hasNumericActual =
      actual !== null &&
      actual !== undefined &&
      actual !== '' &&
      !Number.isNaN(numericActual);

    if ('lte' in ops) {
      return hasNumericActual && numericActual <= Number(ops.lte);
    }
    if ('lt' in ops) {
      return hasNumericActual && numericActual < Number(ops.lt);
    }
    if ('gte' in ops) {
      return hasNumericActual && numericActual >= Number(ops.gte);
    }
    if ('gt' in ops) {
      return hasNumericActual && numericActual > Number(ops.gt);
    }
    if ('eq' in ops) {
      return actual === ops.eq;
    }
    return false;
  }

  private async resolveApprover(
    companyId: string,
    submitterId: string,
    tier: ApprovalRuleTierConfig,
  ): Promise<string> {
    const resolver = (tier.resolver ?? '').toUpperCase();

    if (resolver === 'USER') {
      if (!tier.userId) {
        throw new BadRequestException(
          `Tier "${tier.label}" USER resolver requires userId`,
        );
      }
      await this.assertActiveUser(companyId, tier.userId, tier.label);
      return tier.userId;
    }

    if (resolver === 'DEPARTMENT_LEADER' || resolver === 'SUBMITTER_MANAGER') {
      const submitter = await this.prisma.user.findFirst({
        where: activeOnly({ id: submitterId, companyId }),
        select: {
          departmentId: true,
          department: { select: { leaderUserId: true } },
        },
      });
      const leaderId = submitter?.department?.leaderUserId;
      if (!leaderId) {
        throw new BadRequestException(
          `Cannot resolve department leader for tier "${tier.label}"`,
        );
      }
      await this.assertActiveUser(companyId, leaderId, tier.label);
      return leaderId;
    }

    if (resolver === 'ROLE') {
      return this.resolveRoleApprover(companyId, tier);
    }

    throw new BadRequestException(
      `Unsupported approval resolver "${tier.resolver}" on tier "${tier.label}"`,
    );
  }

  private async resolveRoleApprover(
    companyId: string,
    tier: ApprovalRuleTierConfig,
  ): Promise<string> {
    let roleId = tier.roleId;
    const roleKey = tier.roleCode ?? tier.role;
    if (!roleId && roleKey) {
      const resolvedName = ROLE_ALIASES[roleKey.toUpperCase()] ?? roleKey;
      const role = await this.prisma.role.findFirst({
        where: activeOnly({
          companyId,
          OR: [
            { id: roleKey },
            { name: roleKey },
            { name: resolvedName },
          ],
        }),
        select: { id: true },
      });
      roleId = role?.id;
    }

    if (!roleId) {
      throw new BadRequestException(
        `Tier "${tier.label}" ROLE resolver requires roleId, roleCode, or role`,
      );
    }

    const assignment = await this.prisma.userRole.findFirst({
      where: activeOnly({
        roleId,
        user: activeOnly({ companyId, isActive: true, employmentStatus: 'ACTIVE' as const }),
      }),
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (!assignment) {
      throw new BadRequestException(vacantApproverMessage(roleKey ?? tier.label));
    }

    return assignment.userId;
  }

  private async assertActiveUser(
    companyId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId }),
      select: { id: true, isActive: true, employmentStatus: true },
    });
    if (!user) {
      throw new NotFoundException(`Approver user ${userId} not found`);
    }
    if (isVacantApprover(user)) {
      throw new BadRequestException(vacantApproverMessage(role));
    }
  }
}

/** Narrow Prisma Json to a plain object for form matching. */
export function asFormDataRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
