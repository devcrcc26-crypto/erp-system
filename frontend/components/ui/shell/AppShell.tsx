'use client';

import { usePathname } from 'next/navigation';
import { useAutoMarkNotificationsRead } from '@/hooks/use-auto-mark-notifications-read';
import { useEffect, useMemo, useState } from 'react';
import SidebarShell from '@/components/sidebar/SidebarShell';
import MainContentHeader from '@/components/ui/shell/MainContentHeader';
import {
  AnnouncementModals,
  UrgentAnnouncementBanner,
} from '@/components/modules/announcements/AnnouncementShellLayer';
import {
  extractProjectId,
  resolveRouteMeta,
} from '@/config/navConfig';
import { canShowProjectContextSidebar } from '@/lib/navigation/project-nav-visibility';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCapabilitiesReady, useEpcCapabilities, usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useProject, toProjectSummary } from '@/lib/query/projects';
import { useAuthStore } from '@/stores/auth.store';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
import { useProjectContextStore } from '@/stores/project-context.store';

/**
 * Application shell: skip link, sidebar (desktop column + mobile drawer), and
 * main content. Project workspace navigation lives inside the sidebar's
 * Project Management folder - there is no separate project column.
 */
export default function AppShell({
  children,
  showContextSidebar: showContextSidebarProp,
}: {
  children: React.ReactNode;
  /** Overrides whether the sidebar shows project workspace navigation. */
  showContextSidebar?: boolean;
}): React.ReactNode {
  const pathname = usePathname();
  useAutoMarkNotificationsRead();
  const { t } = useEpcTranslation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const capabilitiesReady = useCapabilitiesReady();
  const accessToken = useAuthStore((state) => state.accessToken);
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();

  const projectId = extractProjectId(pathname);
  const showContextSidebar =
    showContextSidebarProp ??
    (capabilitiesReady &&
      canShowProjectContextSidebar(pathname, epc, pm));

  const setActiveProject = useProjectContextStore((state) => state.setActiveProject);
  const clearProjectContext = useProjectContextStore(
    (state) => state.clearProjectContext,
  );
  const activeProject = useProjectContextStore((state) => state.activeProject);

  const projectQuery = useProject(
    projectId ?? '',
    Boolean(projectId) && capabilitiesReady && Boolean(accessToken),
  );

  useEffect(() => {
    if (!projectId) {
      clearProjectContext();
      return;
    }
    if (projectQuery.data) {
      setActiveProject(toProjectSummary(projectQuery.data));
    }
    return () => {
      clearProjectContext();
    };
  }, [
    projectId,
    projectQuery.data,
    setActiveProject,
    clearProjectContext,
  ]);

  // Close the drawer whenever the route changes (adjust state during render,
  // not in an effect, to avoid a cascading re-render).
  const [drawerPathname, setDrawerPathname] = useState(pathname);
  if (drawerPathname !== pathname) {
    setDrawerPathname(pathname);
    setMobileNavOpen(false);
  }

  const loadedProject = activeProject ?? projectQuery.data ?? null;

  const projectName =
    (loadedProject ? formatLocalizedName(loadedProject) : null) ??
    (projectQuery.isLoading ? '…' : t('nav.projects'));

  const sidebarProjectName = loadedProject?.name ?? (projectQuery.isLoading ? '…' : t('nav.projects'));
  const sidebarProjectNameZh = loadedProject?.nameZh ?? null;

  const sidebarProject = useMemo(
    () =>
      showContextSidebar && projectId
        ? { id: projectId, name: sidebarProjectName, nameZh: sidebarProjectNameZh }
        : null,
    [showContextSidebar, projectId, sidebarProjectName, sidebarProjectNameZh],
  );

  const routeMeta = resolveRouteMeta(pathname, projectName, t);
  const pageTitle = routeMeta.title ?? t(routeMeta.titleKey);
  const pageSubtitle = routeMeta.descriptionKey
    ? t(routeMeta.descriptionKey)
    : undefined;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <a href="#main-content" className="erp-skip-link">
        {t('shell.skipToContent')}
      </a>

      <SidebarShell
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        project={sidebarProject}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <MainContentHeader
          breadcrumbs={routeMeta.breadcrumbs}
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <UrgentAnnouncementBanner />
        <AnnouncementModals />

        <div
          className={
            pathname === '/'
              ? 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-3 sm:px-4 sm:pb-4 lg:px-6'
              : 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6'
          }
        >
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
