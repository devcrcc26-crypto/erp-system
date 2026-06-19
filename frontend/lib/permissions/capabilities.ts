import { apiGet } from '@/lib/api/client';
import type { Capabilities } from '@/lib/api/types';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';

export { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';

/**
 * Loads UI capability flags for the authenticated session from the backend RBAC resolver.
 */
export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    return await apiGet<Capabilities>('/auth/capabilities');
  } catch {
    return { ...EMPTY_CAPABILITIES };
  }
}
