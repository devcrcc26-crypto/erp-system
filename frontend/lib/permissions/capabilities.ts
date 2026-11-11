import { apiGet } from '@/lib/api/client';
import {
  createEmptyPmCapabilities,
  EMPTY_MODULE_CAPABILITIES,
  PM_MODULE_KEYS,
} from '@/lib/api/project-management.types';
import type { Capabilities } from '@/lib/api/types';
import { EMPTY_CAPABILITIES, EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';

export { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';

function normalizeCapabilities(data: Partial<Capabilities> | null | undefined): Capabilities {
  const pm = createEmptyPmCapabilities();

  if (data?.pm) {
    for (const key of PM_MODULE_KEYS) {
      pm[key] = {
        ...EMPTY_MODULE_CAPABILITIES,
        ...data.pm[key],
      };
    }
  }

  return {
    ...EMPTY_CAPABILITIES,
    ...data,
    pm,
    epc: {
      ...EMPTY_EPC_CAPABILITIES,
      ...data?.epc,
    },
  };
}

/**
 * Loads UI capability flags for the authenticated session from the backend RBAC resolver.
 */
export async function fetchCapabilities(): Promise<Capabilities> {
  const data = await apiGet<Capabilities>('/auth/capabilities');
  return normalizeCapabilities(data);
}
