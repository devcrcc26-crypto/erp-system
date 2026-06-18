'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  AuditOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  DashboardOutlined,
  FileOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  IssuesCloseOutlined,
  MailOutlined,
  ProfileOutlined,
  ProjectOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SendOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  PROJECT_WORKSPACE_NAV,
  projectNavHref,
  resolveProjectNavKey,
  type ProjectWorkspaceNavItem,
} from '@/lib/navigation/project-workspace-nav';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import type { PmModuleKey } from '@/lib/api/project-management.types';

const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: <DashboardOutlined />,
  'status-board': <BarChartOutlined />,
  workload: <TeamOutlined />,
  schedule: <ScheduleOutlined />,
  disciplines: <ClusterOutlined />,
  deliverables: <CheckSquareOutlined />,
  submittals: <SendOutlined />,
  rfis: <InboxOutlined />,
  issues: <IssuesCloseOutlined />,
  'daily-logs': <ProfileOutlined />,
  meetings: <CalendarOutlined />,
  correspondence: <MailOutlined />,
  risks: <WarningOutlined />,
  'punch-list': <SafetyOutlined />,
  documents: <FolderOpenOutlined />,
  drawings: <FileOutlined />,
  team: <TeamOutlined />,
  closeout: <AuditOutlined />,
};

function canViewNavItem(
  item: ProjectWorkspaceNavItem,
  pm: ReturnType<typeof usePmCapabilities>,
): boolean {
  const cap = pm[item.capability as PmModuleKey];
  return cap?.canView ?? false;
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
  const selectedKey = resolveProjectNavKey(pathname, projectId);

  const menuItems: MenuProps['items'] = useMemo(() => {
    const groups: MenuProps['items'] = [];

    for (const group of PROJECT_WORKSPACE_NAV) {
      const visibleItems = group.items.filter((item) => canViewNavItem(item, pm));
      if (visibleItems.length === 0) {
        continue;
      }

      groups.push({
        key: `group-${group.key}`,
        type: 'group',
        label: group.label,
        children: visibleItems.map((item) => ({
          key: item.key,
          icon: NAV_ICONS[item.key] ?? <ProjectOutlined />,
          label: (
            <Link href={projectNavHref(projectId, item.pathSuffix)} onClick={onNavigate}>
              {item.label}
            </Link>
          ),
        })),
      });
    }

    return groups;
  }, [pm, projectId, onNavigate]);

  if (!menuItems || menuItems.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        No project modules available for your role.
      </p>
    );
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      className="!border-none !bg-transparent"
      style={{ borderInlineEnd: 'none' }}
    />
  );
}
