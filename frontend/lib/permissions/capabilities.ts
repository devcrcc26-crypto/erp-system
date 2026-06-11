import { apiGet } from '@/lib/api/client';
import type { Capabilities } from '@/lib/api/types';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';

/**
 * Loads UI capability flags from the backend for the current session.
 * Any authenticated user may call this — no RBAC probe requests needed.
 */
export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    return await apiGet<Capabilities>('/auth/capabilities');
  } catch {
    return { ...EMPTY_CAPABILITIES };
  }
}
