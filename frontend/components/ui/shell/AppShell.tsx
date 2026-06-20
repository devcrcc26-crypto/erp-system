'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Drawer } from 'antd';
import IconRail from '@/components/ui/shell/IconRail';
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
  }, [pathname]);

  const projectName =
    activeProject?.name ??
    projectQuery.data?.name ??
    (projectQuery.isLoading ? '…' : t('nav.projects'));

  const routeMeta = resolveRouteMeta(pathname, projectName, t);
  const pageTitle = t(routeMeta.titleKey);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <IconRail />

      {showContextSidebar && projectId && (
        <>
          <div className="hidden h-full shrink-0 lg:block">
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
              body: { padding: 0, background: tokens.colorSidebarBg },
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
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        style={{ background: tokens.colorPageBg }}
      >
        <MainContentHeader
          breadcrumbs={routeMeta.breadcrumbs}
          showContextNavToggle={showContextSidebar && Boolean(projectId)}
          onOpenContextNav={() => setContextDrawerOpen(true)}
        />

        <div className="flex flex-col px-6 py-6 md:px-8 md:py-6">
          <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {pageTitle}
          </h1>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}
