// UI polish pass — styles only, no logic changes

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
  shouldShowContextSidebar,
} from '@/config/navConfig';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProject, toProjectSummary } from '@/lib/query/projects';
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

  const projectId = extractProjectId(pathname);
  const showContextSidebar =
    showContextSidebarProp ?? (projectId !== null && shouldShowContextSidebar(pathname));

  const setActiveProject = useProjectContextStore((state) => state.setActiveProject);
  const clearProjectContext = useProjectContextStore(
    (state) => state.clearProjectContext,
  );
  const activeProject = useProjectContextStore((state) => state.activeProject);

  const projectQuery = useProject(projectId ?? '', Boolean(projectId));

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

  const projectName =
    activeProject?.name ??
    projectQuery.data?.name ??
    (projectQuery.isLoading ? '…' : t('nav.projects'));

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
          <ContextSidebar projectId={projectId} projectName={projectName} />
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <MainContentHeader
          breadcrumbs={routeMeta.breadcrumbs}
          pageTitle={pageTitle}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <div className="flex flex-col p-6">
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}
