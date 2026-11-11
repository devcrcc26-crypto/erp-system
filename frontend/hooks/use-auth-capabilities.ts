'use client';

import { useCurrentUser } from '@/lib/query/profile';
import { canEditLeaveBalances } from '@/lib/utils/leave-balance-access';
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
 * True for HR, or for a supervisor (anyone with direct reports). Team lists
 * then show the reports' records too; the backend scopes them to the
 * viewer's reporting chain.
 */
export function useCanViewTeam(): boolean {
  return useAuthStore(
    (state) => state.capabilities.canViewHr || state.capabilities.hasDirectReports,
  );
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

/** True when the session can open announcement management (create, edit or publish). */
export function useCanManageAnnouncements(): boolean {
  return useAuthStore((state) => state.capabilities.canManageAnnouncements ?? false);
}

/** True when the session can publish, schedule, archive and remind announcements. */
export function useCanPublishAnnouncements(): boolean {
  return useAuthStore((state) => state.capabilities.canPublishAnnouncements ?? false);
}

/** True when the session can export announcement read statistics. */
export function useCanExportAnnouncements(): boolean {
  return useAuthStore((state) => state.capabilities.canExportAnnouncements ?? false);
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

/** True when the session can open purchase request HR pages. */
export function useCanViewPurchaseRequest(): boolean {
  return useAuthStore((state) => state.capabilities.canViewPurchaseRequest);
}

/** True when the session can create and submit purchase requests. */
export function useCanCreatePurchaseRequest(): boolean {
  return useAuthStore((state) => state.capabilities.canCreatePurchaseRequest);
}

/** True when the session can list and manage users. */
export function useCanManageUsers(): boolean {
  return useAuthStore((state) => state.capabilities.canManageUsers);
}

/**
 * True when the session holds users.edit - the permission the backend requires
 * for login-name changes, the approver-only flag and HR password resets.
 * hr.view alone is read-only for these.
 */
export function useCanEditUsers(): boolean {
  return useAuthStore((state) => state.capabilities.canEditUsers);
}

/**
 * True when the session holds the System Administrator role
 * (not merely Project Administrator / elevated access).
 */
export function useIsSystemAdmin(): boolean {
  return useAuthStore((state) => state.capabilities.isSystemAdmin ?? false);
}

/** True when the session holds the HR Manager role. */
export function useIsHrManager(): boolean {
  const currentUser = useCurrentUser();
  return Boolean(currentUser.data?.roles?.some((role) => role.name === 'HR Manager'));
}

/**
 * True when the session may reassign pending approval tiers
 * (HR Manager or System Administrator; the API enforces the same rule).
 */
export function useCanReassignApprovals(): boolean {
  const isSystemAdmin = useIsSystemAdmin();
  const currentUser = useCurrentUser();
  if (isSystemAdmin) {
    return true;
  }
  return Boolean(currentUser.data?.roles?.some((role) => role.name === 'HR Manager'));
}

/**
 * True when the session may set / adjust leave balances
 * (System Administrator, General Manager, or HR roles).
 */
export function useCanEditLeaveBalances(): boolean {
  const isSystemAdmin = useIsSystemAdmin();
  const currentUser = useCurrentUser();
  if (isSystemAdmin) {
    return true;
  }
  return canEditLeaveBalances(currentUser.data?.roles);
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
