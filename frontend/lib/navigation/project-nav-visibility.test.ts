import { describe, expect, it } from 'vitest';
import type { PmCapabilities } from '@/lib/api/project-management.types';
import { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';
import {
  canShowProjectContextSidebar,
  canViewProjectNavItem,
  GLOBAL_ONLY_PROJECT_NAV_KEYS,
  hasProjectSidebarAccess,
} from '@/lib/navigation/project-nav-visibility';
import { flattenProjectNavItems } from '@/lib/navigation/project-workspace-nav';

const basePm = (overrides: Partial<PmCapabilities> = {}): PmCapabilities =>
  ({
    projects: { canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false },
    schedule: { canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false },
    ...overrides,
  }) as PmCapabilities;

describe('project-nav-visibility', () => {
  it('excludes global-only keys from project sidebar for every role', () => {
    const globalItems = flattenProjectNavItems().filter((item) =>
      GLOBAL_ONLY_PROJECT_NAV_KEYS.has(item.key),
    );

    expect(globalItems.length).toBeGreaterThan(0);

    for (const item of globalItems) {
      expect(
        canViewProjectNavItem(item, {
          pm: basePm({
            projects: { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true },
            schedule: { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true },
          }),
          epc: { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true, canViewMyWork: true, canViewReviewInbox: true, canViewMyComments: true },
          hasAssignedDisciplines: true,
          disciplineScopeBypass: true,
        }),
      ).toBe(false);
    }
  });

  it('discipline leader allowlist only includes disciplines', () => {
    const disciplines = flattenProjectNavItems().find((item) => item.key === 'disciplines');
    expect(disciplines).toBeDefined();

    const ctx = {
      pm: basePm(),
      epc: {
        ...EMPTY_EPC_CAPABILITIES,
        navDisciplineLeader: true,
        canViewEngineering: true,
        canViewMyWork: true,
      },
      hasAssignedDisciplines: true,
      disciplineScopeBypass: false,
    };

    expect(canViewProjectNavItem(disciplines!, ctx)).toBe(false);

    expect(
      canViewProjectNavItem(disciplines!, {
        ...ctx,
        pm: basePm({
          schedule: { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false },
        }),
      }),
    ).toBe(true);
  });

  it('FK-only discipline leader has no project sidebar access', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDisciplineLeader: true,
      canViewMyWork: true,
    };
    const pm = basePm();

    expect(hasProjectSidebarAccess(epc, pm)).toBe(false);
    expect(
      canShowProjectContextSidebar('/projects/p1/disciplines', epc, pm),
    ).toBe(false);
  });

  it('design-cycle assignee with projects.canView still has no project sidebar', () => {
    const pmWithProjects = basePm({
      projects: {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      },
    });

    for (const epc of [
      { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
      { ...EMPTY_EPC_CAPABILITIES, navReviewerTier: true },
      { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
      { ...EMPTY_EPC_CAPABILITIES, navSupportingDesigner: true },
    ]) {
      expect(hasProjectSidebarAccess(epc, pmWithProjects)).toBe(false);
      expect(
        canShowProjectContextSidebar('/projects/p1/schedule', epc, pmWithProjects),
      ).toBe(false);
    }
  });

  it('department leader keeps project sidebar without projects.canView', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDepartmentLeader: true,
    };
    const pm = basePm();

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
  });

  it('project viewer keeps project sidebar access', () => {
    const epc = EMPTY_EPC_CAPABILITIES;
    const pm = basePm({
      projects: { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
    expect(
      canShowProjectContextSidebar('/projects/p1/schedule', epc, pm),
    ).toBe(true);
  });
});
