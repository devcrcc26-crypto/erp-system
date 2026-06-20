'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Drawer } from 'antd';
import IconRail from '@/components/ui/shell/IconRail';
import MainNavPanel from '@/components/ui/shell/MainNavPanel';
import ContextSidebar from '@/components/ui/shell/ContextSidebar';
import MainContentHeader from '@/components/ui/shell/MainContentHeader';
import {
  extractProjectId,
  resolveRouteMeta,
  shouldShowContextSidebar,
} from '@/config/navConfig';
import { RAIL_EXPANDED_WIDTH } from '@/components/ui/shell/shell-layout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProject, toProjectSummary } from '@/lib/query/projects';
import { useProjectContextStore } from '@/stores/project-context.store';
import { tokens } from '@/lib/theme/tokens';

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
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [mainNavDrawerOpen, setMainNavDrawerOpen] = useState(false);

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
    setContextDrawerOpen(false);
    setMainNavDrawerOpen(false);
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

      <Drawer
        placement="left"
        open={mainNavDrawerOpen}
        onClose={() => setMainNavDrawerOpen(false)}
        size={RAIL_EXPANDED_WIDTH}
        closable
        title={null}
        className="lg:hidden"
        styles={{
          body: { padding: 0, background: tokens.colorSidebarBg },
          header: { display: 'none' },
        }}
      >
        <MainNavPanel
          isExpanded
          onNavigate={() => setMainNavDrawerOpen(false)}
        />
      </Drawer>

      {showContextSidebar && projectId && (
        <>
          <div className="relative z-10 hidden h-full shrink-0 lg:block">
            <ContextSidebar
              projectId={projectId}
              projectName={projectName}
            />
          </div>

          <Drawer
            placement="left"
            open={contextDrawerOpen}
            onClose={() => setContextDrawerOpen(false)}
            size={260}
            closable
            title={null}
            className="lg:hidden"
            styles={{
              body: { padding: 0, background: tokens.colorCardBg },
              header: { display: 'none' },
            }}
          >
            <ContextSidebar
              projectId={projectId}
              projectName={projectName}
              onNavigate={() => setContextDrawerOpen(false)}
            />
          </Drawer>
        </>
      )}

      <main
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
        style={{ background: tokens.colorPageBg }}
      >
        <MainContentHeader
          breadcrumbs={routeMeta.breadcrumbs}
          pageTitle={pageTitle}
          onOpenMainNav={() => setMainNavDrawerOpen(true)}
          showContextNavToggle={showContextSidebar && Boolean(projectId)}
          onOpenContextNav={() => setContextDrawerOpen(true)}
        />

        <div className="flex flex-col px-4 py-4 sm:px-6 sm:py-6 md:px-8">
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}
