'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  buildIconRailNav,
  flattenIconRailNav,
  resolveIconRailKey,
  type IconRailItem,
} from '@/config/navConfig';
import NavDomainRail from '@/components/ui/shell/nav/NavDomainRail';
import NavModulePanel from '@/components/ui/shell/nav/NavModulePanel';
import {
  buildNavDomains,
  domainHasModulePanel,
  findNavDomain,
} from '@/components/ui/shell/nav/nav-domains';
import {
  useCanViewMyComments,
  useCanViewMyWork,
  useCanViewReviewInbox,
  useCanViewChangeRequests,
  useCanViewCorrespondence,
  useCanViewExternalReleases,
  useCanViewDailyLogs,
  useCanViewIssues,
  useCanViewRisks,
  useCanViewPunchList,
  useCanViewMeetings,
  useCanViewRfis,
  useCanViewSubmittals,
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import {
  useCanViewAuditLogs,
  useCanManageRoles,
  useCanManageUsers,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import {
  useCanViewDepartmentsNav,
  useCanViewDisciplinesCatalogNav,
} from '@/hooks/use-org-nav-access';
import { canViewGlobalNavKey } from '@/lib/navigation/project-nav-visibility';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
import {
  NAV_DOMAIN_RAIL_WIDTH,
  SHELL_TOP_HEADER_HEIGHT,
} from '@/components/ui/shell/shell-layout';

/**
 * Main navigation: domain rail plus the selected domain's module panel.
 * Collapsed (`isExpanded === false`) renders the rail only, with flyout panels.
 * Expanded shows the module panel only for domains that have one (e.g. HR);
 * direct destinations (dashboard, approvals, settings) keep the rail alone.
 */
export default function MainNavPanel({
  isExpanded,
  onNavigate,
  onModulePanelVisibleChange,
}: {
  isExpanded: boolean;
  onNavigate?: () => void;
  /** Notifies the shell when the second sidebar is shown or hidden. */
  onModulePanelVisibleChange?: (visible: boolean) => void;
}): React.ReactNode {
  const pathname = usePathname();
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();
  const canViewMyWork = useCanViewMyWork();
  const canViewSubmittals = useCanViewSubmittals();
  const canViewExternalReleases = useCanViewExternalReleases();
  const canViewChangeRequests = useCanViewChangeRequests();
  const canViewRfis = useCanViewRfis();
  const canViewIssues = useCanViewIssues();
  const canViewRisks = useCanViewRisks();
  const canViewPunchList = useCanViewPunchList();
  const canViewMeetings = useCanViewMeetings();
  const canViewCorrespondence = useCanViewCorrespondence();
  const canViewDailyLogs = useCanViewDailyLogs();
  const canViewAuditLogs = useCanViewAuditLogs();
  const canViewHr = useCanViewHr();
  const canManageUsers = useCanManageUsers();
  const canManageRoles = useCanManageRoles();
  const canViewDepartments = useCanViewDepartmentsNav();
  const canViewPositions = useCanViewDepartmentsNav();
  const canViewDisciplinesCatalog = useCanViewDisciplinesCatalogNav();

  const navStructure = useMemo(
    () =>
      buildIconRailNav({
        canViewReviewInbox: !permLoading && canViewReviewInbox,
        canViewMyComments: !permLoading && canViewMyComments,
        canViewMyWork: !permLoading && canViewMyWork,
        canViewSubmittals: !permLoading && canViewSubmittals,
        canViewExternalReleases: !permLoading && canViewExternalReleases,
        canViewChangeRequests: !permLoading && canViewChangeRequests,
        canViewRfis: !permLoading && canViewRfis,
        canViewIssues: !permLoading && canViewIssues,
        canViewRisks: !permLoading && canViewRisks,
        canViewPunchList: !permLoading && canViewPunchList,
        canViewMeetings: !permLoading && canViewMeetings,
        canViewCorrespondence: !permLoading && canViewCorrespondence,
        canViewDailyLogs: !permLoading && canViewDailyLogs,
        canViewApprovals: !permLoading,
        canViewHr: !permLoading && canViewHr,
        canViewAuditLogs: !permLoading && canViewAuditLogs,
        canManageUsers: !permLoading && canManageUsers,
        canManageRoles: !permLoading && canManageRoles,
        canViewProjects: !permLoading && pm.projects.canView,
        canViewDepartments: !permLoading && canViewDepartments,
        canViewPositions: !permLoading && canViewPositions,
        canViewDisciplinesCatalog: !permLoading && canViewDisciplinesCatalog,
      }),
    [
      permLoading,
      canViewReviewInbox,
      canViewMyComments,
      canViewMyWork,
      canViewSubmittals,
      canViewExternalReleases,
      canViewChangeRequests,
      canViewRfis,
      canViewIssues,
      canViewRisks,
      canViewPunchList,
      canViewMeetings,
      canViewCorrespondence,
      canViewDailyLogs,
      canViewHr,
      canViewAuditLogs,
      canManageUsers,
      canManageRoles,
      pm.projects.canView,
      canViewDepartments,
      canViewPositions,
      canViewDisciplinesCatalog,
    ],
  );

  const visibleStructure = useMemo(() => {
    function isItemVisible(item: IconRailItem): boolean {
      return item.visible && canViewGlobalNavKey(item.key, epc, pm);
    }

    return {
      topItems: navStructure.topItems.filter(isItemVisible),
      groups: navStructure.groups
        .map((group) => ({
          ...group,
          items: group.items.filter(isItemVisible),
        }))
        .filter((group) => group.items.length > 0),
      standalone: navStructure.standalone.filter(isItemVisible),
    };
  }, [navStructure, epc, pm]);

  const selectedKey = resolveIconRailKey(
    pathname,
    flattenIconRailNav(visibleStructure),
  );

  const domains = useMemo(
    () => buildNavDomains(visibleStructure, selectedKey),
    [visibleStructure, selectedKey],
  );

  const [browsedDomainKey, setBrowsedDomainKey] = useState<string | null>(null);

  const activeDomain = findNavDomain(domains, domains.activeDomainKey);
  // Only panel domains (HR, Organization, …) keep the second sidebar open
  // for the current route; direct destinations resolve to null.
  const routePanelDomainKey = domainHasModulePanel(activeDomain)
    ? activeDomain.key
    : null;

  // Sync the module panel to the route. Manual rail clicks still open a
  // panel without waiting for a route change (browsedDomainKey override).
  useEffect(() => {
    setBrowsedDomainKey(routePanelDomainKey);
  }, [pathname, routePanelDomainKey]);

  const panelDomain = findNavDomain(domains, browsedDomainKey);
  const showPanel =
    isExpanded && domainHasModulePanel(panelDomain);

  useEffect(() => {
    onModulePanelVisibleChange?.(showPanel);
  }, [showPanel, onModulePanelVisibleChange]);

  if (permLoading) {
    return (
      <div
        className="flex h-full"
        style={{ background: tokens.colorSidebarBg }}
        aria-busy
      >
        <div
          className="flex h-full shrink-0 flex-col gap-2 px-2 pt-3"
          style={{
            width: NAV_DOMAIN_RAIL_WIDTH,
            paddingTop: SHELL_TOP_HEADER_HEIGHT + 12,
          }}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="erp-page-skeleton mx-auto h-10 w-10 rounded-[8px]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0"
      style={{ background: tokens.colorSidebarBg }}
    >
      <NavDomainRail
        primary={domains.primary}
        utility={domains.utility}
        activeDomainKey={domains.activeDomainKey}
        browsedDomainKey={browsedDomainKey}
        selectedKey={selectedKey}
        isExpanded={isExpanded}
        showPanel={showPanel}
        onBrowseDomain={setBrowsedDomainKey}
        onNavigate={onNavigate}
        t={t}
      />

      {showPanel && panelDomain ? (
        <NavModulePanel
          domain={panelDomain}
          selectedKey={selectedKey}
          onNavigate={onNavigate}
          t={t}
        />
      ) : null}
    </div>
  );
}
