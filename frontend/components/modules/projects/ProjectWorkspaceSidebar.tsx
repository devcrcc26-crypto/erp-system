'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  PROJECT_WORKSPACE_NAV,
  projectNavHref,
  resolveProjectNavKey,
  type ProjectWorkspaceNavItem,
} from '@/lib/navigation/project-workspace-nav';
import { getNavIcon, resolveNavIconKey } from '@/lib/navigation/nav-icons';
import { layout } from '@/lib/theme/layout';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProjectDisciplines } from '@/lib/query/disciplines';
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
    item.epcSurface === 'engineering' &&
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
        children: visibleItems.map((item) => ({
          key: item.key,
          icon: getNavIcon(resolveNavIconKey(item.key, item.iconKey)),
          label: (
            <Link href={projectNavHref(projectId, item.pathSuffix)} onClick={onNavigate}>
              {t(item.labelKey)}
            </Link>
          ),
        })),
      });
    }

    return groups;
  }, [
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
