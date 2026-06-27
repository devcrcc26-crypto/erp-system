'use client';

import { useAuthStore } from '@/stores/auth.store';

/**
 * True when the session can view the company audit log (audit.view permission).
 */
export function useCanViewAuditLogs(): boolean {
  return useAuthStore((state) => state.capabilities.canViewAuditLogs);
}

/** True when the session can list and manage users. */
export function useCanManageUsers(): boolean {
  return useAuthStore((state) => state.capabilities.canManageUsers);
}

/** True when the session can view roles / settings administration. */
export function useCanManageRoles(): boolean {
  const caps = useAuthStore((state) => state.capabilities);
  return caps.canManageRoles || caps.canEditRoles;
}
