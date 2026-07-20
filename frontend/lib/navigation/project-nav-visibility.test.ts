import { describe, expect, it } from 'vitest';
import type { PmCapabilities } from '@/lib/api/project-management.types';
import { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';
import {
  canShowProjectContextSidebar,
  canViewGlobalNavKey,
  canViewProjectNavItem,
  GLOBAL_ONLY_PROJECT_NAV_KEYS,
  hasProjectSidebarAccess,
} from '@/lib/navigation/project-nav-visibility';
import { flattenProjectNavItems } from '@/lib/navigation/project-workspace-nav';

const basePm = (overrides: Partial<PmCapabilities> = {}): PmCapabilities =>
  ({
    projects: { canView: false, canCreate: false, canEdit: false, canDelete: false },
    schedule: { canView: false, canCreate: false, canEdit: false, canDelete: false },
    submittals: { canView: false, canCreate: false, canEdit: false, canDelete: false },
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
            projects: { canView: true, canCreate: true, canEdit: true, canDelete: true },
            schedule: { canView: true, canCreate: true, canEdit: true, canDelete: true },
          }),
          epc: { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true, canViewMyWork: true, canViewReviewInbox: true, canViewMyComments: true },
          hasAssignedDisciplines: true,
          disciplineScopeBypass: true,
        }),
      ).toBe(false);
    }
  });

  it('discipline leader allowlist includes disciplines and submittals', () => {
    const disciplines = flattenProjectNavItems().find((item) => item.key === 'disciplines');
    const submittals = flattenProjectNavItems().find((item) => item.key === 'submittals');
    expect(disciplines).toBeDefined();
    expect(submittals).toBeDefined();

    const ctx = {
      pm: basePm({
        schedule: { canView: true, canCreate: false, canEdit: false, canDelete: false },
      }),
      epc: {
        ...EMPTY_EPC_CAPABILITIES,
        navDisciplineLeader: true,
        canViewEngineering: true,
        canViewMyWork: true,
      },
      hasAssignedDisciplines: true,
      disciplineScopeBypass: false,
    };

    expect(canViewProjectNavItem(disciplines!, ctx)).toBe(true);
    expect(canViewProjectNavItem(submittals!, ctx)).toBe(true);
  });

  it('FK-only discipline leader has project sidebar when allowlist is non-empty', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDisciplineLeader: true,
      canViewMyWork: true,
    };
    const pm = basePm();

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
    expect(
      canShowProjectContextSidebar('/projects/p1/submittals', epc, pm),
    ).toBe(true);
  });

  it('designer sees submittals in project sidebar', () => {
    const submittals = flattenProjectNavItems().find((item) => item.key === 'submittals');
    expect(submittals).toBeDefined();

    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDesigner: true,
      canViewMyWork: true,
    };
    const pm = basePm();

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
    expect(
      canViewProjectNavItem(submittals!, {
        pm,
        epc,
        hasAssignedDisciplines: true,
        disciplineScopeBypass: false,
      }),
    ).toBe(true);
  });

  it('reviewer-only design-cycle assignee still has no project sidebar', () => {
    const pmWithProjects = basePm({
      projects: {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      },
    });

    for (const epc of [
      { ...EMPTY_EPC_CAPABILITIES, navReviewerTier: true },
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
      projects: { canView: true, canCreate: false, canEdit: false, canDelete: false },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
    expect(
      canShowProjectContextSidebar('/projects/p1/schedule', epc, pm),
    ).toBe(true);
  });
});

describe('canViewGlobalNavKey — submittals', () => {
  it('allows designer and discipline leader to see /submittals', () => {
    expect(
      canViewGlobalNavKey('/submittals', {
        ...EMPTY_EPC_CAPABILITIES,
        navDesigner: true,
      }),
    ).toBe(true);
    expect(
      canViewGlobalNavKey('/submittals', {
        ...EMPTY_EPC_CAPABILITIES,
        navDisciplineLeader: true,
      }),
    ).toBe(true);
  });

  it('hides /submittals from reviewer and supporting designer', () => {
    expect(
      canViewGlobalNavKey('/submittals', {
        ...EMPTY_EPC_CAPABILITIES,
        navReviewerTier: true,
      }),
    ).toBe(false);
    expect(
      canViewGlobalNavKey('/submittals', {
        ...EMPTY_EPC_CAPABILITIES,
        navSupportingDesigner: true,
      }),
    ).toBe(false);
  });

  it('allows full-access and non-design-cycle users', () => {
    expect(
      canViewGlobalNavKey('/submittals', {
        ...EMPTY_EPC_CAPABILITIES,
        navFullAccess: true,
      }),
    ).toBe(true);
    expect(canViewGlobalNavKey('/submittals', EMPTY_EPC_CAPABILITIES)).toBe(
      true,
    );
  });
});
