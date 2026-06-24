'use client';

import type { ComponentType, CSSProperties, ReactNode } from 'react';
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  CommentOutlined,
  DashboardOutlined,
  ExportOutlined,
  FileProtectOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  FundOutlined,
  InboxOutlined,
  IssuesCloseOutlined,
  MailOutlined,
  MessageOutlined,
  PieChartOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';

type NavIconComponent = ComponentType<{ className?: string; style?: CSSProperties }>;

/**
 * Single source of truth for app-rail and project-context sidebar icons.
 * Keys match `IconRailItem.iconKey` and `ProjectWorkspaceNavItem.iconKey`.
 */
export const NAV_ICON_COMPONENTS: Record<string, NavIconComponent> = {
  dashboard: DashboardOutlined,
  projects: ProjectOutlined,
  'review-inbox': InboxOutlined,
  'my-comments': CommentOutlined,
  kanban: AppstoreOutlined,
  users: UserOutlined,
  teams: TeamOutlined,
  'audit-logs': AuditOutlined,
  reports: PieChartOutlined,
  messages: MessageOutlined,
  settings: SettingOutlined,
  profile: UserOutlined,
  'status-board': BarChartOutlined,
  workload: FundOutlined,
  schedule: ScheduleOutlined,
  disciplines: ClusterOutlined,
  deliverables: CheckSquareOutlined,
  submittals: FileProtectOutlined,
  'external-release': ExportOutlined,
  rfis: QuestionCircleOutlined,
  issues: IssuesCloseOutlined,
  'daily-logs': BookOutlined,
  meetings: CalendarOutlined,
  correspondence: MailOutlined,
  risks: WarningOutlined,
  'punch-list': SafetyOutlined,
  documents: FolderOpenOutlined,
  team: TeamOutlined,
  closeout: FlagOutlined,
};

/** Shared icon sizing for main rail and context sidebar links. */
export const navIconClassName =
  'erp-nav-icon flex shrink-0 items-center justify-center text-[16px] leading-none';

/**
 * Resolves the icon registry key for a navigation item.
 */
export function resolveNavIconKey(
  itemKey: string,
  iconKey?: string,
): string {
  return iconKey ?? itemKey;
}

/**
 * Returns the icon component for a navigation key.
 */
export function getNavIconComponent(iconKey: string): NavIconComponent {
  return NAV_ICON_COMPONENTS[iconKey] ?? ProjectOutlined;
}

/**
 * Returns the Ant Design icon element for a navigation key.
 */
export function getNavIcon(iconKey: string): React.ReactNode {
  const Icon = getNavIconComponent(iconKey);
  return <Icon aria-hidden />;
}
