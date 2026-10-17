import { useQuery } from '@tanstack/react-query';
import { fetchOrgGapReport } from '@/lib/api/org-gaps';

export const orgGapsKeys = {
  all: ['org-gaps'] as const,
};

export function useOrgGapReport(enabled = true) {
  return useQuery({
    queryKey: orgGapsKeys.all,
    queryFn: fetchOrgGapReport,
    enabled,
  });
}
