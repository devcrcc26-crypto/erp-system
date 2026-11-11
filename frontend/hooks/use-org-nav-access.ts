'use client';

import { useMemo } from 'react';
import { PROJECT_ADMINISTRATOR_ROLE } from '@/lib/constants/org-roles';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  useCapabilitiesReady,
  useEpcCapabilities,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';

/**
 * True when the session may open the company Departments page.
 * Uses session EPC nav probes - does not list /departments (avoids 403 noise for design roles).
 * HR Officers also see Organization (departments / positions) via hr.view.
 */
export function useCanViewDepartmentsNav(): boolean {
  const capabilitiesReady = useCapabilitiesReady();
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const canViewHr = useAuthStore((state) => state.capabilities.canViewHr);
  const epc = useEpcCapabilities();

  return useMemo(() => {
    if (!capabilitiesReady) {
      return false;
    }
    return (
      isSystemAdministrator ||
      canViewHr ||
      epc.navFullAccess ||
      epc.navDepartmentLeader
    );
  }, [
    canViewHr,
    capabilitiesReady,
    epc.navDepartmentLeader,
    epc.navFullAccess,
    isSystemAdministrator,
  ]);
}

/**
 * True when the session may edit departments (System Administrator only).
 */
export function useCanManageDepartments(): boolean {
  return useAuthStore((state) => state.capabilities.isSystemAdministrator);
}

/**
 * True when the session may open the engineering Disciplines catalog page.
 * HR Officers also see the catalog via hr.view (backend: departments.view).
 */
export function useCanViewDisciplinesCatalogNav(): boolean {
  const permLoading = usePermissionsLoading();
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const canViewHr = useAuthStore((state) => state.capabilities.canViewHr);
  const epc = useEpcCapabilities();
  const profileQuery = useCurrentUser();

  return useMemo(() => {
    if (permLoading) {
      return false;
    }
    if (isSystemAdministrator || epc.navFullAccess || canViewHr) {
      return true;
    }
    const roles = profileQuery.data?.roles ?? [];
    return roles.some((role) => role.name === PROJECT_ADMINISTRATOR_ROLE);
  }, [
    canViewHr,
    epc.navFullAccess,
    isSystemAdministrator,
    permLoading,
    profileQuery.data?.roles,
  ]);
}

/**
 * True when the session may create or edit engineering disciplines.
 */
export function useCanManageDisciplinesCatalog(): boolean {
  return useAuthStore((state) => state.capabilities.isSystemAdministrator);
}
