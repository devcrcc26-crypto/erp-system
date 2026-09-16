'use client';

import type { ComponentType, CSSProperties } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  CommentOutlined,
  DashboardOutlined,
  DiffOutlined,
  ExportOutlined,
  FileProtectOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  FundOutlined,
  IdcardOutlined,
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
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Car,
  CircleDollarSign,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileSignature,
  Fuel,
  Monitor,
  Package,
  PackageMinus,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Receipt,
  Search,
  ShoppingCart,
  Stamp,
  Star,
  Timer,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';

type NavIconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

/**
 * Adapts a Lucide icon to the sidebar icon API (className / style / 16px).
 */
function lucideNavIcon(Icon: LucideIcon): NavIconComponent {
  function LucideNavIcon({
    className,
    style,
  }: {
    className?: string;
    style?: CSSProperties;
  }): React.ReactNode {
    return (
      <Icon
        aria-hidden
        className={className}
        style={style}
        size={16}
        strokeWidth={1.75}
      />
    );
  }

  LucideNavIcon.displayName = `NavIcon(${Icon.displayName ?? Icon.name})`;
  return LucideNavIcon;
}

/**
 * Single source of truth for app-rail and project-context sidebar icons.
 * Keys match `IconRailItem.iconKey` and `ProjectWorkspaceNavItem.iconKey`.
 * HR keys use Lucide for clearer title matching.
 */
export const NAV_ICON_COMPONENTS: Record<string, NavIconComponent> = {
  dashboard: DashboardOutlined,
  projects: ProjectOutlined,

  // Sidebar rail domains — one per module group
  'domain-projects': ProjectOutlined,
  'domain-hr': lucideNavIcon(Users),
  'domain-hr-configuration': lucideNavIcon(ClipboardList),
  'domain-organization': ApartmentOutlined,
  'new-request': lucideNavIcon(FilePlus2),
  'my-profile': lucideNavIcon(CircleUserRound),
  'review-inbox': InboxOutlined,
  'my-comments': CommentOutlined,
  'my-work': CheckSquareOutlined,
  departments: ApartmentOutlined,
  positions: IdcardOutlined,
  'disciplines-catalog': ClusterOutlined,
  kanban: AppstoreOutlined,
  users: lucideNavIcon(Users),
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

  // HR — Lucide icons matched to module titles
  'hr-leave': lucideNavIcon(CalendarDays),
  'hr-leave-policy': lucideNavIcon(ClipboardList),
  'hr-work-schedules': lucideNavIcon(CalendarClock),
  'hr-public-holidays': lucideNavIcon(CalendarOff),
  'hr-overtime': lucideNavIcon(Timer),
  'hr-employee-contract': lucideNavIcon(FileSignature),
  'hr-expense': lucideNavIcon(Receipt),
  'hr-purchase': lucideNavIcon(ShoppingCart),
  'hr-material': lucideNavIcon(Package),
  'hr-consumables': lucideNavIcon(PackageOpen),
  'hr-flight': lucideNavIcon(Plane),
  'hr-vehicle': lucideNavIcon(Car),
  'hr-official-seal': lucideNavIcon(Stamp),
  'hr-project-seal': lucideNavIcon(BadgeCheck),
  'hr-refueling': lucideNavIcon(Fuel),
  'hr-inspection': lucideNavIcon(Wrench),
  'hr-business-trip': lucideNavIcon(BriefcaseBusiness),
  'hr-per-diem': lucideNavIcon(Wallet),
  'hr-per-diem-rates': lucideNavIcon(CircleDollarSign),
  'hr-company-asset': lucideNavIcon(Monitor),
  'hr-attendance': lucideNavIcon(CalendarCheck2),
  'hr-equipment-and-materials-exit-permit': lucideNavIcon(PackageMinus),
  'hr-employee-evaluation': lucideNavIcon(ClipboardCheck),
  'hr-reports': lucideNavIcon(BarChart3),

  // Sidebar chrome
  favorites: lucideNavIcon(Star),
  search: lucideNavIcon(Search),
  'sidebar-collapse': lucideNavIcon(PanelLeftClose),
  'sidebar-expand': lucideNavIcon(PanelLeftOpen),
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
 * Returns the navigation icon element for a key.
 */
export function getNavIcon(iconKey: string): React.ReactNode {
  const Icon = getNavIconComponent(iconKey);
  return <Icon aria-hidden />;
}
