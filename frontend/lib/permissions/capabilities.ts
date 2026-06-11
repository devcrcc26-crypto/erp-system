import { apiProbe } from '@/lib/api/client';
import type { Capabilities } from '@/lib/api/types';

/**
 * Probes backend RBAC by hitting read-only list endpoints.
 * JWT does not include permissions — this caches what the current session can do.
 */
export async function probeCapabilities(): Promise<Capabilities> {
  const [canManageUsers, canManageRoles, canEditRoles] = await Promise.all([
    apiProbe('/users?limit=1'),
    apiProbe('/roles?limit=1'),
    apiProbe('/permissions'),
  ]);

  return {
    canManageUsers,
    canCreateUsers: canManageUsers,
    canManageRoles,
    canEditRoles: canManageRoles && canEditRoles,
  };
}
