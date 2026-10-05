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
 * True when the session can edit Human Resources records (hr.edit).
 */
export function useCanEditHr(): boolean {
  return useAuthStore((state) => state.capabilities.canEditHr);
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

/**
 * True when the session can open payroll runs (any payroll module permission).
 */
export function useCanAccessPayroll(): boolean {
  return useAuthStore((state) => state.capabilities.canAccessPayroll);
}

/** True when the session can create and process payroll runs. */
export function useCanCreatePayroll(): boolean {
  return useAuthStore((state) => state.capabilities.canCreatePayroll);
}

/** True when the session can edit payroll entry bonus top-ups and notes. */
export function useCanEditPayroll(): boolean {
  return useAuthStore((state) => state.capabilities.canEditPayroll);
}

/** True when the session can approve payroll runs (HR / GM). */
export function useCanApprovePayroll(): boolean {
  return useAuthStore((state) => state.capabilities.canApprovePayroll);
}

/** True when the session can export payroll Excel / bank files. */
export function useCanExportPayroll(): boolean {
  return useAuthStore((state) => state.capabilities.canExportPayroll);
}

/**
 * True when the session can open HR flight pages (view, create, or full HR).
 */
export function useCanAccessFlight(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr ||
      state.capabilities.canViewFlight ||
      state.capabilities.canCreateFlight,
  );
}

/**
 * True when the session can submit flight applications.
 */
export function useCanCreateFlight(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canCreateFlight || state.capabilities.canViewHr,
  );
}

/**
 * True when the session can attach flight tickets (HR / flight.manage).
 */
export function useCanManageFlight(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr || state.capabilities.canManageFlight,
  );
}

/**
 * True when the session can open HR business trip pages (view, create, or full HR).
 */
export function useCanAccessBusinessTrip(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr ||
      state.capabilities.canViewBusinessTrip ||
      state.capabilities.canCreateBusinessTrip,
  );
}

/**
 * True when the session can submit business trips.
 */
export function useCanCreateBusinessTrip(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canCreateBusinessTrip ||
      state.capabilities.canViewHr,
  );
}

/**
 * True when the session can attach business trip tickets (HR / business-trip.manage).
 */
export function useCanManageBusinessTrip(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr ||
      state.capabilities.canManageBusinessTrip,
  );
}

/** True when the session can list and manage users. */
export function useCanManageUsers(): boolean {
  return useAuthStore((state) => state.capabilities.canManageUsers);
}

/**
 * True when the session holds the System Administrator role
 * (not merely Project Administrator / elevated access).
 */
export function useIsSystemAdmin(): boolean {
  return useAuthStore((state) => state.capabilities.isSystemAdmin ?? false);
}

/**
 * True when the session can manage employee per diem rates (HR module or user admin).
 */
export function useCanManageEmployeePerDiemRates(): boolean {
  return useAuthStore(
    (state) =>
      state.capabilities.canViewHr || state.capabilities.canManageUsers,
  );
}

/** True when the session can view roles / settings administration. */
export function useCanManageRoles(): boolean {
  const caps = useAuthStore((state) => state.capabilities);
  return caps.canManageRoles || caps.canEditRoles;
}
