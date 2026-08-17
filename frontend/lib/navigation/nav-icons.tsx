'use client';

import type { ComponentType, CSSProperties, ReactNode } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ClusterOutlined,
  CommentOutlined,
  DashboardOutlined,
  DiffOutlined,
  DollarOutlined,
  ExportOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  FundOutlined,
  GlobalOutlined,
  IdcardOutlined,
  InboxOutlined,
  IssuesCloseOutlined,
  LaptopOutlined,
  MailOutlined,
  MessageOutlined,
  PieChartOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ComputerIcon } from 'lucide-react';

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
  'my-work': CheckSquareOutlined,
  departments: ApartmentOutlined,
  positions: IdcardOutlined,
  'disciplines-catalog': ClusterOutlined,
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
  'change-requests': DiffOutlined,
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
  approvals: AuditOutlined,
  'hr-leave': CalendarOutlined,
  'hr-overtime': ClockCircleOutlined,
  'hr-employee-contract': FileTextOutlined,
  'hr-expense': DollarOutlined,
  'hr-purchase': ShoppingCartOutlined,
  'hr-material': InboxOutlined,
  'hr-consumables': ShoppingOutlined,
  'hr-flight': RocketOutlined,
  'hr-vehicle': CarOutlined,
  'hr-official-seal': SafetyCertificateOutlined,
  'hr-project-seal': FileProtectOutlined,
  'hr-refueling': ThunderboltOutlined,
  'hr-inspection': ToolOutlined,
  'hr-business-trip': GlobalOutlined,
  'hr-per-diem': WalletOutlined,
  'hr-per-diem-rates': BankOutlined,
  'hr-asset-management': LaptopOutlined,
  'hr-attendance': CalendarOutlined,
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
