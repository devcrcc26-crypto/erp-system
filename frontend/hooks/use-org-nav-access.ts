'use client';

import { useMemo } from 'react';
import { PROJECT_ADMINISTRATOR_ROLE } from '@/lib/constants/org-roles';
import { useDepartments } from '@/lib/query/org';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import { useCapabilitiesReady, usePermissionsLoading } from '@/hooks/use-pm-capabilities';

/**
 * True when the session may open the company Departments page (admin or department leader).
 */
export function useCanViewDepartmentsNav(): boolean {
  const capabilitiesReady = useCapabilitiesReady();
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const currentUserId = useAuthStore((state) => state.user?.id);
  const departmentsQuery = useDepartments(
    { page: 1, limit: 100 },
    capabilitiesReady && Boolean(currentUserId),
  );

  return useMemo(() => {
    if (!capabilitiesReady || !currentUserId) {
      return false;
    }
    if (isSystemAdministrator) {
      return true;
    }
    const departments = departmentsQuery.data?.data ?? [];
    return departments.some((row) => row.leaderUserId === currentUserId);
  }, [
    capabilitiesReady,
    currentUserId,
    departmentsQuery.data?.data,
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
 */
export function useCanViewDisciplinesCatalogNav(): boolean {
  const permLoading = usePermissionsLoading();
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const profileQuery = useCurrentUser();

  return useMemo(() => {
    if (permLoading) {
      return false;
    }
    if (isSystemAdministrator) {
      return true;
    }
    const roles = profileQuery.data?.roles ?? [];
    return roles.some((role) => role.name === PROJECT_ADMINISTRATOR_ROLE);
  }, [isSystemAdministrator, permLoading, profileQuery.data?.roles]);
}

/**
 * True when the session may create or edit engineering disciplines.
 */
export function useCanManageDisciplinesCatalog(): boolean {
  return useAuthStore((state) => state.capabilities.isSystemAdministrator);
}
