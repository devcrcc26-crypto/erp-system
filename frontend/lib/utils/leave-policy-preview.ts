import type { LeavePolicyRuleInput } from '@/lib/api/leave-policy.types';

/**
 * Client-side entitlement preview matching backend progressive leave math.
 */
export function previewEntitlement(
  rule: LeavePolicyRuleInput,
  yearsOfService: number,
): number {
  const minimumYears = (rule.minimumServiceMonths ?? 0) / 12;
  if (yearsOfService < minimumYears) {
    return 0;
  }

  let days = rule.baseDays;

  if (
    rule.isProgressive &&
    rule.incrementDays != null &&
    rule.incrementEveryYears != null &&
    rule.incrementEveryYears > 0
  ) {
    const progressiveYears = Math.max(0, yearsOfService - minimumYears);
    const steps = Math.floor(progressiveYears / rule.incrementEveryYears);
    days += steps * rule.incrementDays;
  }

  if (rule.maxDaysCap != null) {
    days = Math.min(days, rule.maxDaysCap);
  }

  return Math.round(days * 10) / 10;
}
