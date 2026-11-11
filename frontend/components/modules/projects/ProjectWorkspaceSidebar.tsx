'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Badge, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import {
  PROJECT_WORKSPACE_NAV,
  projectNavHref,
  resolveProjectNavKey,
} from '@/lib/navigation/project-workspace-nav';
import {
  canViewProjectNavItem,
  isProjectNavReady,
} from '@/lib/navigation/project-nav-visibility';
import { getNavIcon, resolveNavIconKey } from '@/lib/navigation/nav-icons';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import {
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useChangeRequestOpenCount } from '@/lib/query/change-requests';
import { useDeliverableActiveCount } from '@/lib/query/deliverables';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';

export default function ProjectWorkspaceSidebar({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const lens = useRoleLens();
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !permLoading && !lens.disciplineScopeBypass,
  );
  const hasAssignedDisciplines = (disciplinesQuery.data?.length ?? 0) > 0;
  const navReady = isProjectNavReady(
    !permLoading,
    lens.disciplineScopeBypass,
    disciplinesQuery.isLoading,
  );
  const { t } = useEpcTranslation();
  const selectedKey = resolveProjectNavKey(pathname, projectId);
  const changeRequestCount = useChangeRequestOpenCount(
    projectId,
    navReady && pm.change_requests.canView,
  );
  const deliverableCount = useDeliverableActiveCount(
    projectId,
    navReady && pm.schedule.canView,
  );

  const navContext = useMemo(
    () => ({
      pm,
      epc,
      hasAssignedDisciplines,
      disciplineScopeBypass: lens.disciplineScopeBypass,
    }),
    [pm, epc, hasAssignedDisciplines, lens.disciplineScopeBypass],
  );

  const menuItems: MenuProps['items'] = useMemo(() => {
    if (!navReady) {
      return [];
    }

    const groups: MenuProps['items'] = [];

    for (const group of PROJECT_WORKSPACE_NAV) {
      const visibleItems = group.items.filter((item) =>
        canViewProjectNavItem(item, navContext),
      );
      if (visibleItems.length === 0) {
        continue;
      }

      groups.push({
        key: `group-${group.key}`,
        type: 'group',
        label: t(group.labelKey),
        children: visibleItems.map((item) => {
          const badge =
            item.key === 'change-requests'
              ? (() => {
                  const count = changeRequestCount.data ?? 0;
                  return count > 0 ? count : undefined;
                })()
              : item.key === 'deliverables'
                ? (() => {
                    const count = deliverableCount.data ?? 0;
                    return count > 0 ? count : undefined;
                  })()
                : undefined;
          const labelText = t(item.labelKey);
          return {
            key: item.key,
            icon: getNavIcon(resolveNavIconKey(item.key, item.iconKey)),
            label: (
              <Link
                href={projectNavHref(projectId, item.pathSuffix)}
                onClick={onNavigate}
                className="flex items-center justify-between gap-2"
              >
                <span>{labelText}</span>
                {badge != null && (
                  <Badge
                    count={badge}
                    size="small"
                    style={{
                      backgroundColor:
                        item.key === 'deliverables'
                          ? tokens.colorTeal600
                          : tokens.colorAmber400,
                    }}
                  />
                )}
              </Link>
            ),
          };
        }),
      });
    }

    return groups;
  }, [
    changeRequestCount.data,
    deliverableCount.data,
    navContext,
    navReady,
    onNavigate,
    projectId,
    t,
  ]);

  if (!navReady) {
    return <PageLoadingSkeleton />;
  }

  if (!menuItems || menuItems.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        {t('empty.noModules')}
      </p>
    );
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      className={`${layout.projectSidebarMenu} !border-none !bg-transparent`}
      style={{ borderInlineEnd: 'none' }}
    />
  );
}
