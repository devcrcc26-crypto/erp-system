import { LeaveType, type Prisma } from '@prisma/client';

/** Balance buckets that are seeded from leave policy rules. */
export const POLICY_BALANCE_LEAVE_TYPES: LeaveType[] = [
  LeaveType.ANNUAL,
  LeaveType.MATERNITY,
  LeaveType.PATERNITY,
];

/**
 * Leave types that never touch a leave-balance bucket (no entitlement check,
 * no pending reserve, no USED ledger entry). Sick is request-only until a pay
 * tier / illness-onset engine exists (Labour Proclamation No. 1156/2019).
 * Unpaid is treated like absence for payroll.
 */
export const REQUEST_ONLY_LEAVE_TYPES: LeaveType[] = [
  LeaveType.UNPAID,
  LeaveType.SICK,
];

/**
 * Whether submitting this leave type reserves / deducts a leave-balance bucket.
 */
export function leaveTypeAffectsBalance(leaveType: LeaveType): boolean {
  return !REQUEST_ONLY_LEAVE_TYPES.includes(leaveType);
}

/**
 * Maps a leave request type to the balance row that should be adjusted.
 * Request-only types have no balance row — callers must gate with
 * {@link leaveTypeAffectsBalance} first.
 */
export function getBalanceLeaveType(leaveType: LeaveType): LeaveType {
  switch (leaveType) {
    case LeaveType.ANNUAL:
    case LeaveType.STUDY:
    case LeaveType.EXAM:
    case LeaveType.EMERGENCY:
    case LeaveType.COMPASSIONATE:
      return LeaveType.ANNUAL;
    case LeaveType.MATERNITY:
      return LeaveType.MATERNITY;
    case LeaveType.PATERNITY:
      return LeaveType.PATERNITY;
    case LeaveType.SICK:
    case LeaveType.UNPAID:
      // No balance bucket; kept for exhaustiveness / legacy callers.
      return LeaveType.ANNUAL;
    default:
      return LeaveType.ANNUAL;
  }
}

export type PolicyRuleRow = {
  leaveType: LeaveType;
  baseDays: Prisma.Decimal | number;
  isProgressive: boolean;
  incrementDays: Prisma.Decimal | number | null;
  incrementEveryYears: number | null;
  minimumServiceMonths: number;
  maxDaysCap: Prisma.Decimal | number | null;
  maxCarryForwardDays: Prisma.Decimal | number | null;
  requiresReceipt: boolean;
};

/**
 * Entitlement days for a policy rule at `yearsOfService` (service-year steps:
 * +incrementDays every incrementEveryYears after the minimum service).
 */
export function entitlementFromPolicyRule(
  rule: PolicyRuleRow,
  yearsOfService: number,
): number {
  const minimumYears = rule.minimumServiceMonths / 12;
  if (yearsOfService < minimumYears) {
    return 0;
  }

  let days = Number(rule.baseDays);

  if (
    rule.isProgressive &&
    rule.incrementDays != null &&
    rule.incrementEveryYears != null &&
    rule.incrementEveryYears > 0
  ) {
    const progressiveYears = Math.max(0, yearsOfService - minimumYears);
    const steps = Math.floor(progressiveYears / rule.incrementEveryYears);
    days += steps * Number(rule.incrementDays);
  }

  if (rule.maxDaysCap != null) {
    days = Math.min(days, Number(rule.maxDaysCap));
  }

  return Math.round(days * 10) / 10;
}

/** Longest service span searched when inverting a policy rule. */
const MAX_SERVICE_YEARS = 60;

/**
 * Fewest full service years at which `rule` grants exactly `entitlement`
 * days (inverse of {@link entitlementFromPolicyRule}). Used to estimate tenure
 * from imported entitlements. Null when no service length produces it.
 */
export function inferMinServiceYears(
  rule: PolicyRuleRow,
  entitlement: number,
): number | null {
  for (let years = 0; years <= MAX_SERVICE_YEARS; years += 1) {
    if (entitlementFromPolicyRule(rule, years) === entitlement) {
      return years;
    }
  }
  return null;
}
