'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Badge, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  PROJECT_WORKSPACE_NAV,
  projectNavHref,
  resolveProjectNavKey,
  type ProjectWorkspaceNavItem,
} from '@/lib/navigation/project-workspace-nav';
import { getNavIcon, resolveNavIconKey } from '@/lib/navigation/nav-icons';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useChangeRequestOpenCount } from '@/lib/query/change-requests';
import { useDeliverableActiveCount } from '@/lib/query/deliverables';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import type { PmModuleKey } from '@/lib/api/project-management.types';

function canViewNavItem(
  item: ProjectWorkspaceNavItem,
  pm: ReturnType<typeof usePmCapabilities>,
  epc: ReturnType<typeof useEpcCapabilities>,
  hasAssignedDisciplines: boolean,
  disciplineScopeBypass: boolean,
): boolean {
  const cap = pm[item.capability as PmModuleKey];
  if (!cap?.canView) {
    return false;
  }

  if (item.epcSurface === 'engineering' && !epc.canViewEngineering) {
    return false;
  }

  if (item.epcCapability === 'reviewInbox' && !epc.canViewReviewInbox) {
    return false;
  }

  if (item.epcCapability === 'myComments' && !epc.canViewMyComments) {
    return false;
  }

  if (
    item.requiresDisciplineAssignment &&
    !disciplineScopeBypass &&
    !hasAssignedDisciplines
  ) {
    return false;
  }

  return true;
}

export default function ProjectWorkspaceSidebar({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const lens = useRoleLens();
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !lens.disciplineScopeBypass,
  );
  const hasAssignedDisciplines = (disciplinesQuery.data?.length ?? 0) > 0;
  const { t } = useEpcTranslation();
  const selectedKey = resolveProjectNavKey(pathname, projectId);
  const changeRequestCount = useChangeRequestOpenCount(
    projectId,
    pm.projects.canView,
  );
  const deliverableCount = useDeliverableActiveCount(
    projectId,
    pm.schedule.canView,
  );

  const navBadgeCount = (key: string): number | undefined => {
    if (key === 'change-requests') {
      const count = changeRequestCount.data ?? 0;
      return count > 0 ? count : undefined;
    }
    if (key === 'deliverables') {
      const count = deliverableCount.data ?? 0;
      return count > 0 ? count : undefined;
    }
    return undefined;
  };

  const menuItems: MenuProps['items'] = useMemo(() => {
    const groups: MenuProps['items'] = [];

    for (const group of PROJECT_WORKSPACE_NAV) {
      const visibleItems = group.items.filter((item) =>
        canViewNavItem(
          item,
          pm,
          epc,
          hasAssignedDisciplines,
          lens.disciplineScopeBypass,
        ),
      );
      if (visibleItems.length === 0) {
        continue;
      }

      groups.push({
        key: `group-${group.key}`,
        type: 'group',
        label: t(group.labelKey),
        children: visibleItems.map((item) => {
          const badge = navBadgeCount(item.key);
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
    epc,
    hasAssignedDisciplines,
    lens.disciplineScopeBypass,
    onNavigate,
    pm,
    projectId,
    t,
  ]);

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
