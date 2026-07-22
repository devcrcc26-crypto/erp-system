// UI polish pass - styles only, no logic changes

'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import IconRail from '@/components/ui/shell/IconRail';
import MobileNavDrawer from '@/components/ui/shell/MobileNavDrawer';
import ContextSidebar from '@/components/ui/shell/ContextSidebar';
import MainContentHeader from '@/components/ui/shell/MainContentHeader';
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
 * Three-pane application shell: icon rail, context sidebar, and main content.
 */
export default function AppShell({
  children,
  showContextSidebar: showContextSidebarProp,
}: {
  children: React.ReactNode;
  showContextSidebar?: boolean;
}): React.ReactNode {
  const pathname = usePathname();
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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const loadedProject = activeProject ?? projectQuery.data ?? null;

  const projectName =
    (loadedProject ? formatLocalizedName(loadedProject) : null) ??
    (projectQuery.isLoading ? '…' : t('nav.projects'));

  const projectDisplayName = loadedProject
    ? { name: loadedProject.name, nameZh: loadedProject.nameZh }
    : {
        name: projectQuery.isLoading ? '…' : t('nav.projects'),
        nameZh: null,
      };

  const routeMeta = resolveRouteMeta(pathname, projectName, t);
  const pageTitle = t(routeMeta.titleKey);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <IconRail coverContextSidebar={showContextSidebar && Boolean(projectId)} />

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        showProjectNav={showContextSidebar && Boolean(projectId)}
        projectId={projectId}
        projectName={projectName}
      />

      {showContextSidebar && projectId && (
        <div className="relative z-10 hidden h-full shrink-0 lg:block">
          <ContextSidebar
            projectId={projectId}
            projectName={projectDisplayName.name}
            projectNameZh={projectDisplayName.nameZh}
          />
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <MainContentHeader
          breadcrumbs={routeMeta.breadcrumbs}
          pageTitle={pageTitle}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <div className="flex flex-col p-3 sm:p-4 lg:p-6">
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}
