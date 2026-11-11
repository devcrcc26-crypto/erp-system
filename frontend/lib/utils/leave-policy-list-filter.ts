import type { LeavePolicy } from '@/lib/api/leave-policy.types';

export type LeavePolicyStatusMode =
  | 'all'
  | 'active'
  | 'inactive'
  | 'progressive';

export interface LeavePolicyListFilters {
  search: string;
  statusMode?: LeavePolicyStatusMode;
}

function policyHasProgressiveAnnual(policy: LeavePolicy): boolean {
  return policy.rules.some(
    (rule) => rule.leaveType === 'ANNUAL' && rule.isProgressive,
  );
}

/**
 * Client-side filter for leave policy list (search + status mode).
 */
export function filterLeavePolicies(
  policies: LeavePolicy[],
  filters: LeavePolicyListFilters,
): LeavePolicy[] {
  const needle = filters.search.trim().toLowerCase();
  const mode = filters.statusMode ?? 'all';

  return policies.filter((policy) => {
    if (mode === 'active' && !policy.isActive) {
      return false;
    }
    if (mode === 'inactive' && policy.isActive) {
      return false;
    }
    if (mode === 'progressive' && !policyHasProgressiveAnnual(policy)) {
      return false;
    }

    if (!needle) {
      return true;
    }

    const haystack = [
      policy.name,
      policy.governedBy ?? '',
      policy.description ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}
