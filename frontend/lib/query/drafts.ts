import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { DraftItem, DraftModule } from '@/lib/api/drafts.types';

export function useMyDrafts(
  enabled: boolean,
  module?: DraftModule,
) {
  return useQuery({
    queryKey: ['drafts', 'my', module ?? 'all'],
    queryFn: () =>
      apiGet<DraftItem[]>('/drafts/my', module ? { params: { module } } : undefined),
    enabled,
  });
}
