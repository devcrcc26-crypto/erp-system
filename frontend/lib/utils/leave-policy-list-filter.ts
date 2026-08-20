import type { LeavePolicy } from '@/lib/api/leave-policy.types';

export interface LeavePolicyListFilters {
  search: string;
  /** `undefined` = all */
  isActive?: boolean;
  /** `undefined` = all; filters on annual rule progressive flag */
  isProgressive?: boolean;
}

function policyHasProgressiveAnnual(policy: LeavePolicy): boolean {
  return policy.rules.some(
    (rule) => rule.leaveType === 'ANNUAL' && rule.isProgressive,
  );
}

/**
 * Client-side filter for leave policy list (search + status + progressive).
 */
export function filterLeavePolicies(
  policies: LeavePolicy[],
  filters: LeavePolicyListFilters,
): LeavePolicy[] {
  const needle = filters.search.trim().toLowerCase();

  return policies.filter((policy) => {
    if (
      filters.isActive !== undefined &&
      policy.isActive !== filters.isActive
    ) {
      return false;
    }

    if (filters.isProgressive !== undefined) {
      const progressive = policyHasProgressiveAnnual(policy);
      if (progressive !== filters.isProgressive) {
        return false;
      }
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
