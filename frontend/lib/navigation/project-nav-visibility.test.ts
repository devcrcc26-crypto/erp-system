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

  it('discipline leader allowlist includes disciplines and submittals but not change requests', () => {
    const disciplines = flattenProjectNavItems().find((item) => item.key === 'disciplines');
    const submittals = flattenProjectNavItems().find((item) => item.key === 'submittals');
    const changeRequests = flattenProjectNavItems().find(
      (item) => item.key === 'change-requests',
    );
    expect(disciplines).toBeDefined();
    expect(submittals).toBeDefined();
    expect(changeRequests).toBeDefined();

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
    expect(canViewProjectNavItem(changeRequests!, ctx)).toBe(false);
  });

  it('full-access user with FK designer probe still sees change requests in project sidebar', () => {
    const changeRequests = flattenProjectNavItems().find(
      (item) => item.key === 'change-requests',
    );
    expect(changeRequests).toBeDefined();

    expect(
      canViewProjectNavItem(changeRequests!, {
        pm: basePm({
          change_requests: {
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
          },
        }),
        epc: {
          ...EMPTY_EPC_CAPABILITIES,
          navFullAccess: true,
          navDesigner: true,
          disciplineScopeBypass: true,
        },
        hasAssignedDisciplines: true,
        disciplineScopeBypass: true,
      }),
    ).toBe(true);
  });

  it('FK-only designer still hides change requests in project sidebar', () => {
    const changeRequests = flattenProjectNavItems().find(
      (item) => item.key === 'change-requests',
    );
    expect(changeRequests).toBeDefined();

    expect(
      canViewProjectNavItem(changeRequests!, {
        pm: basePm({
          change_requests: {
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
          },
        }),
        epc: {
          ...EMPTY_EPC_CAPABILITIES,
          navDesigner: true,
          canViewMyWork: true,
        },
        hasAssignedDisciplines: true,
        disciplineScopeBypass: false,
      }),
    ).toBe(false);
  });

  it('FK-only discipline leader has no project sidebar even with Employee projects.canView', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDisciplineLeader: true,
      canViewMyWork: true,
    };
    const pm = basePm({
      projects: { canView: true, canCreate: false, canEdit: false, canDelete: false },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(false);
    expect(
      canShowProjectContextSidebar('/projects/p1/submittals', epc, pm),
    ).toBe(false);
  });

  it('FK-only designer has no project sidebar even with Employee projects.canView', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDesigner: true,
      canViewMyWork: true,
    };
    const pm = basePm({
      projects: { canView: true, canCreate: false, canEdit: false, canDelete: false },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(false);
    expect(
      canShowProjectContextSidebar('/projects/p1/submittals', epc, pm),
    ).toBe(false);
  });

  it('designer allowlist still permits submittals item for item-level checks', () => {
    const submittals = flattenProjectNavItems().find((item) => item.key === 'submittals');
    expect(submittals).toBeDefined();

    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navDesigner: true,
      canViewMyWork: true,
    };
    const pm = basePm({
      projects: { canView: true, canCreate: false, canEdit: false, canDelete: false },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(false);
    expect(
      canViewProjectNavItem(submittals!, {
        pm,
        epc,
        hasAssignedDisciplines: true,
        disciplineScopeBypass: false,
      }),
    ).toBe(true);
  });

  it('Project Manager with designer FK still has sidebar via navFullAccess', () => {
    const epc = {
      ...EMPTY_EPC_CAPABILITIES,
      navFullAccess: true,
      navDesigner: true,
    };
    const pm = basePm({
      projects: { canView: true, canCreate: true, canEdit: true, canDelete: true },
    });

    expect(hasProjectSidebarAccess(epc, pm)).toBe(true);
    expect(
      canShowProjectContextSidebar('/projects/p1/schedule', epc, pm),
    ).toBe(true);
  });

  it('reviewer / supporting designer FK never get project sidebar from projects.canView', () => {
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

describe('canViewGlobalNavKey - submittals', () => {
  const moduleCaps = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
  const pmCanView = {
    submittals: { ...moduleCaps, canView: true },
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };
  const pmNoView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };

  it('allows designer and discipline leader to see /submittals', () => {
    expect(
      canViewGlobalNavKey(
        '/submittals',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmNoView,
      ),
    ).toBe(true);
    expect(
      canViewGlobalNavKey(
        '/submittals',
        { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('hides /submittals from reviewer and supporting designer', () => {
    expect(
      canViewGlobalNavKey(
        '/submittals',
        { ...EMPTY_EPC_CAPABILITIES, navReviewerTier: true },
        pmNoView,
      ),
    ).toBe(false);
    expect(
      canViewGlobalNavKey(
        '/submittals',
        { ...EMPTY_EPC_CAPABILITIES, navSupportingDesigner: true },
        pmNoView,
      ),
    ).toBe(false);
  });

  it('hides /submittals from Employee-only (no FK, no module view)', () => {
    expect(
      canViewGlobalNavKey('/submittals', EMPTY_EPC_CAPABILITIES, pmNoView),
    ).toBe(false);
  });

  it('allows Project Admin via pm.submittals.canView without design persona', () => {
    expect(
      canViewGlobalNavKey('/submittals', EMPTY_EPC_CAPABILITIES, pmCanView),
    ).toBe(true);
  });

  it('allows full-access users', () => {
    expect(
      canViewGlobalNavKey(
        '/submittals',
        { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true },
        pmNoView,
      ),
    ).toBe(true);
  });
});

describe('canViewGlobalNavKey - change requests', () => {
  const moduleCaps = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
  const pmCanView = {
    submittals: moduleCaps,
    change_requests: { ...moduleCaps, canView: true },
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };
  const pmNoView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };

  it('allows designer and discipline leader to see /change-requests', () => {
    expect(
      canViewGlobalNavKey(
        '/change-requests',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmNoView,
      ),
    ).toBe(true);
    expect(
      canViewGlobalNavKey(
        '/change-requests',
        { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('allows Project Admin via pm.change_requests.canView', () => {
    expect(
      canViewGlobalNavKey(
        '/change-requests',
        EMPTY_EPC_CAPABILITIES,
        pmCanView,
      ),
    ).toBe(true);
  });
});

describe('canViewGlobalNavKey - rfis', () => {
  const moduleCaps = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
  const pmRfiCanView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: { ...moduleCaps, canView: true },
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };
  const pmNoView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };
  const pmWithProjects = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: { ...moduleCaps, canView: true },
  };

  it('allows designer and discipline leader to see /rfis', () => {
    expect(
      canViewGlobalNavKey(
        '/rfis',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmNoView,
      ),
    ).toBe(true);
    expect(
      canViewGlobalNavKey(
        '/rfis',
        { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('allows Project Admin via pm.rfis.canView', () => {
    expect(
      canViewGlobalNavKey('/rfis', EMPTY_EPC_CAPABILITIES, pmRfiCanView),
    ).toBe(true);
  });

  it('allows full-access users to see /rfis (portfolio all-list)', () => {
    expect(
      canViewGlobalNavKey(
        '/rfis',
        { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true },
        pmWithProjects,
      ),
    ).toBe(true);
    expect(
      canViewGlobalNavKey(
        '/rfis',
        { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('allows designer even when projects.canView is true (Employee + FK)', () => {
    expect(
      canViewGlobalNavKey(
        '/rfis',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmWithProjects,
      ),
    ).toBe(true);
  });
});

describe('canViewGlobalNavKey - daily-logs', () => {
  const moduleCaps = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
  const pmDailyLogCanView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: { ...moduleCaps, canView: true },
    projects: moduleCaps,
  };
  const pmNoView = {
    submittals: moduleCaps,
    change_requests: moduleCaps,
    rfis: moduleCaps,
    issues: moduleCaps,
    meetings: moduleCaps,
    risks: moduleCaps,
    dailyLogs: moduleCaps,
    projects: moduleCaps,
  };

  it('allows designer and discipline leader to see /daily-logs', () => {
    expect(
      canViewGlobalNavKey(
        '/daily-logs',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmNoView,
      ),
    ).toBe(true);
    expect(
      canViewGlobalNavKey(
        '/daily-logs',
        { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('allows users with pm.dailyLogs.canView', () => {
    expect(
      canViewGlobalNavKey(
        '/daily-logs',
        EMPTY_EPC_CAPABILITIES,
        pmDailyLogCanView,
      ),
    ).toBe(true);
  });

  it('hides /daily-logs without capability or FK role', () => {
    expect(
      canViewGlobalNavKey('/daily-logs', EMPTY_EPC_CAPABILITIES, pmNoView),
    ).toBe(false);
  });
});

describe('canViewGlobalNavKey - punch-list', () => {
  const moduleCaps = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
  const pmPunchCanView = {
    punchItems: { ...moduleCaps, canView: true },
    risks: moduleCaps,
    projects: moduleCaps,
  };
  const pmNoView = {
    punchItems: moduleCaps,
    risks: moduleCaps,
    projects: moduleCaps,
  };

  it('shows /punch-list for discipline leaders', () => {
    expect(
      canViewGlobalNavKey(
        '/punch-list',
        { ...EMPTY_EPC_CAPABILITIES, navDisciplineLeader: true },
        pmNoView,
      ),
    ).toBe(true);
  });

  it('hides /punch-list for full-access (project sidebar instead)', () => {
    expect(
      canViewGlobalNavKey(
        '/punch-list',
        { ...EMPTY_EPC_CAPABILITIES, navFullAccess: true },
        pmPunchCanView,
      ),
    ).toBe(false);
  });

  it('shows /punch-list for punchItems.canView without full access', () => {
    expect(
      canViewGlobalNavKey('/punch-list', EMPTY_EPC_CAPABILITIES, pmPunchCanView),
    ).toBe(true);
  });

  it('hides /punch-list for designers without punch capability', () => {
    expect(
      canViewGlobalNavKey(
        '/punch-list',
        { ...EMPTY_EPC_CAPABILITIES, navDesigner: true },
        pmNoView,
      ),
    ).toBe(false);
  });
});
