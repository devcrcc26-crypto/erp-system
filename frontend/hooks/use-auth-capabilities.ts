'use client';

import { useAuthStore } from '@/stores/auth.store';

/**
 * True when the session can view the company audit log (audit.view permission).
 */
export function useCanViewAuditLogs(): boolean {
  return useAuthStore((state) => state.capabilities.canViewAuditLogs);
}

/**
 * True when the session can access Human Resources (hr.view permission).
 */
export function useCanViewHr(): boolean {
  return useAuthStore((state) => state.capabilities.canViewHr);
}

/**
 * True when the session can open HR leave pages (view, create, or full HR).
 */
export function useCanAccessLeave(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr ||
      state.capabilities.canViewLeave ||
      state.capabilities.canCreateLeave,
  );
}

/**
 * True when the session can submit leave requests.
 */
export function useCanCreateLeave(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canCreateLeave || state.capabilities.canViewHr,
  );
}

/**
 * True when the session can open HR overtime pages (view, create, or full HR).
 */
export function useCanAccessOvertime(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr ||
      state.capabilities.canViewOvertime ||
      state.capabilities.canCreateOvertime,
  );
}

/**
 * True when the session can view company-wide overtime lists (hr.view only).
 * Module overtime.view alone still scopes to own records server-side.
 */
export function useCanViewOvertime(): boolean {
  return useAuthStore((state) => state.capabilities.canViewHr);
}

/**
 * True when the session can submit overtime requests.
 */
export function useCanCreateOvertime(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canCreateOvertime || state.capabilities.canViewHr,
  );
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
