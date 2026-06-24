'use client';

import type { ReactNode } from 'react';
import {
  AuditOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  CommentOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  IssuesCloseOutlined,
  MailOutlined,
  ProfileOutlined,
  ProjectOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';

/**
 * Single source of truth for app-rail and project-context sidebar icons.
 * Keys match `IconRailItem.iconKey` and `ProjectWorkspaceNavItem.key`.
 */
const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: <DashboardOutlined />,
  projects: <ProjectOutlined />,
  'review-inbox': <InboxOutlined />,
  'my-comments': <CommentOutlined />,
  kanban: <UnorderedListOutlined />,
  users: <TeamOutlined />,
  teams: <TeamOutlined />,
  'audit-logs': <AuditOutlined />,
  reports: <BarChartOutlined />,
  messages: <MailOutlined />,
  settings: <SettingOutlined />,
  'status-board': <BarChartOutlined />,
  workload: <TeamOutlined />,
  schedule: <ScheduleOutlined />,
  disciplines: <ClusterOutlined />,
  deliverables: <CheckSquareOutlined />,
  submittals: <SendOutlined />,
  'external-release': <SendOutlined />,
  rfis: <InboxOutlined />,
  issues: <IssuesCloseOutlined />,
  'daily-logs': <ProfileOutlined />,
  meetings: <CalendarOutlined />,
  correspondence: <MailOutlined />,
  risks: <WarningOutlined />,
  'punch-list': <SafetyOutlined />,
  documents: <FolderOpenOutlined />,
  team: <TeamOutlined />,
  closeout: <AuditOutlined />,
};

/** Shared icon sizing for main rail and context sidebar links. */
export const navIconClassName =
  'erp-nav-icon flex shrink-0 items-center justify-center text-[16px] leading-none';

/**
 * Returns the Ant Design icon for a navigation key.
 */
export function getNavIcon(iconKey: string): ReactNode {
  return NAV_ICONS[iconKey] ?? <ProjectOutlined />;
}
