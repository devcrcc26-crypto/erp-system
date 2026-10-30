'use client';

import type { ComponentType, CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BadgeCheck,
  Banknote,
  BarChart3,
  BookOpenCheck,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Car,
  ChartGantt,
  CircleAlert,
  CircleDollarSign,
  CircleHelp,
  CircleUserRound,
  ClipboardCheck,
  Clock,
  Coins,
  Contact,
  DoorOpen,
  FileCheck2,
  FileDiff,
  FileOutput,
  FilePlus2,
  FileSignature,
  Fingerprint,
  Flag,
  FolderKanban,
  FolderOpen,
  Fuel,
  Gauge,
  HardHat,
  IdCard,
  Inbox,
  Kanban,
  Laptop,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  ListChecks,
  ListTodo,
  Mail,
  MailCheck,
  MapPin,
  Megaphone,
  MessageCircleQuestion,
  MessageSquare,
  MessagesSquare,
  Monitor,
  Network,
  Newspaper,
  NotebookPen,
  Package,
  PackageCheck,
  PackageOpen,
  PieChart,
  Pin,
  PinOff,
  Plane,
  Presentation,
  Receipt,
  Repeat,
  Route,
  ScrollText,
  Search,
  Settings,
  Settings2,
  Shapes,
  ShoppingCart,
  SlidersHorizontal,
  SquareCheckBig,
  Stamp,
  Star,
  Timer,
  TriangleAlert,
  Truck,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Workflow,
  Wrench,
  // User Guide topics
  AlarmClock,
  Award,
  Bell,
  BookUser,
  Calculator,
  CarFront,
  CheckCheck,
  ClipboardList,
  Footprints,
  HandCoins,
  HardDrive,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Luggage,
  Navigation,
  PlaneTakeoff,
  ReceiptText,
  Rocket,
  Sofa,
  Trophy,
  Umbrella,
  UserPlus,
  Warehouse,
} from 'lucide-react';

type NavIconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

/**
 * Adapts a Lucide icon to the nav icon API. The glyph is sized `1em` so it
 * follows the surrounding `font-size` (`.sb-icon`, `navIconClassName`, KPI
 * tiles) exactly like the previous Ant Design glyphs did.
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
        size="1em"
        strokeWidth={1.75}
        absoluteStrokeWidth={false}
      />
    );
  }

  LucideNavIcon.displayName = `NavIcon(${Icon.displayName ?? Icon.name})`;
  return LucideNavIcon;
}

/**
 * Single source of truth for sidebar, project-workspace and list-page icons.
 * Keys match `SidebarLinkConfig.icon`, `SidebarFolderConfig.icon` and
 * `ProjectWorkspaceNavItem.iconKey`.
 *
 * One glyph per destination: every key below maps to a distinct Lucide icon
 * so no two sidebar entries share a symbol (a test in
 * `sidebar-model.test.ts` enforces this for the sidebar config).
 */
export const NAV_ICON_COMPONENTS: Record<string, NavIconComponent> = {
  // ── Top of rail ──
  dashboard: lucideNavIcon(LayoutDashboard),
  'new-request': lucideNavIcon(FilePlus2),
  approvals: lucideNavIcon(ListChecks),
  announcements: lucideNavIcon(Megaphone),
  'user-guide': lucideNavIcon(CircleHelp),

  // ── Rail folders (one per domain) ──
  'domain-hr': lucideNavIcon(UsersRound),
  'domain-time': lucideNavIcon(Clock),
  'domain-finance': lucideNavIcon(Banknote),
  'domain-operations': lucideNavIcon(Boxes),
  'domain-projects': lucideNavIcon(FolderKanban),
  'domain-hr-configuration': lucideNavIcon(Settings2),
  'domain-organization': lucideNavIcon(Network),

  // ── People ──
  users: lucideNavIcon(Users),
  'hr-my-team': lucideNavIcon(UserCheck),
  'hr-employee-contract': lucideNavIcon(FileSignature),
  'hr-evaluation-inbox': lucideNavIcon(MailCheck),
  'hr-employee-evaluation': lucideNavIcon(ClipboardCheck),
  'hr-evaluation-cycles': lucideNavIcon(Repeat),
  'hr-evaluation-templates': lucideNavIcon(LayoutTemplate),
  departments: lucideNavIcon(Building2),
  positions: lucideNavIcon(IdCard),
  'disciplines-catalog': lucideNavIcon(Shapes),
  'hr-reports': lucideNavIcon(BarChart3),
  'hr-policy-settings': lucideNavIcon(SlidersHorizontal),
  'hr-org-gaps': lucideNavIcon(Workflow),

  // ── Time & Attendance ──
  'hr-leave': lucideNavIcon(CalendarDays),
  'hr-leave-policy': lucideNavIcon(BookOpenCheck),
  'hr-public-holidays': lucideNavIcon(CalendarOff),
  'hr-attendance': lucideNavIcon(CalendarCheck2),
  'hr-attendance-identities': lucideNavIcon(Fingerprint),
  'hr-field-movement': lucideNavIcon(Route),
  'hr-work-from-home': lucideNavIcon(Laptop),
  'hr-site-assignments': lucideNavIcon(MapPin),
  'hr-work-schedules': lucideNavIcon(CalendarRange),
  'hr-overtime': lucideNavIcon(Timer),

  // ── Pay & Travel ──
  'hr-payroll': lucideNavIcon(CircleDollarSign),
  'hr-expense': lucideNavIcon(Receipt),
  'hr-flight': lucideNavIcon(Plane),
  'hr-business-trip': lucideNavIcon(BriefcaseBusiness),
  'hr-per-diem': lucideNavIcon(Wallet),
  'hr-per-diem-rates': lucideNavIcon(Coins),

  // ── Operations ──
  'hr-purchase': lucideNavIcon(ShoppingCart),
  'hr-material': lucideNavIcon(Package),
  'hr-consumables': lucideNavIcon(PackageOpen),
  'hr-vehicle': lucideNavIcon(Car),
  'hr-refueling': lucideNavIcon(Fuel),
  'hr-inspection': lucideNavIcon(Wrench),
  'hr-company-vehicles': lucideNavIcon(Truck),
  'hr-company-asset': lucideNavIcon(Monitor),
  'hr-official-seal': lucideNavIcon(Stamp),
  'hr-project-seal': lucideNavIcon(BadgeCheck),
  'hr-equipment-and-materials-exit-permit': lucideNavIcon(DoorOpen),
  'announcements-manage': lucideNavIcon(Newspaper),

  // ── Project Management ──
  projects: lucideNavIcon(HardHat),
  'review-inbox': lucideNavIcon(Inbox),
  'my-comments': lucideNavIcon(MessageSquare),
  'my-work': lucideNavIcon(SquareCheckBig),
  kanban: lucideNavIcon(Kanban),
  reports: lucideNavIcon(PieChart),
  submittals: lucideNavIcon(FileCheck2),
  'external-release': lucideNavIcon(FileOutput),
  'change-requests': lucideNavIcon(FileDiff),
  rfis: lucideNavIcon(MessageCircleQuestion),
  issues: lucideNavIcon(CircleAlert),
  risks: lucideNavIcon(TriangleAlert),
  'punch-list': lucideNavIcon(ListTodo),
  'daily-logs': lucideNavIcon(NotebookPen),
  meetings: lucideNavIcon(Presentation),
  correspondence: lucideNavIcon(Mail),

  // ── Project workspace extras ──
  documents: lucideNavIcon(FolderOpen),
  team: lucideNavIcon(Contact),
  teams: lucideNavIcon(UserCog),
  closeout: lucideNavIcon(Flag),
  schedule: lucideNavIcon(ChartGantt),
  disciplines: lucideNavIcon(Layers),
  deliverables: lucideNavIcon(PackageCheck),
  'status-board': lucideNavIcon(Activity),
  workload: lucideNavIcon(Gauge),
  messages: lucideNavIcon(MessagesSquare),
  profile: lucideNavIcon(UserRound),

  // ── User Guide topics (each opens a different /help page) ──
  'guide-getting-started': lucideNavIcon(Rocket),
  'guide-dashboard': lucideNavIcon(LayoutGrid),
  'guide-approvals': lucideNavIcon(CheckCheck),
  'guide-profile': lucideNavIcon(BookUser),
  'guide-announcements': lucideNavIcon(Bell),
  'guide-tips': lucideNavIcon(Lightbulb),
  'guide-leave': lucideNavIcon(Umbrella),
  'guide-overtime': lucideNavIcon(AlarmClock),
  'guide-site-assignments': lucideNavIcon(Navigation),
  'guide-work-from-home': lucideNavIcon(Sofa),
  'guide-field-movement': lucideNavIcon(Footprints),
  'guide-attendance': lucideNavIcon(ClipboardList),
  'guide-expense-claims': lucideNavIcon(ReceiptText),
  'guide-per-diem': lucideNavIcon(HandCoins),
  'guide-flight': lucideNavIcon(PlaneTakeoff),
  'guide-business-trips': lucideNavIcon(Luggage),
  'guide-payroll': lucideNavIcon(Calculator),
  'guide-materials': lucideNavIcon(Warehouse),
  'guide-vehicles': lucideNavIcon(CarFront),
  'guide-seals': lucideNavIcon(Award),
  'guide-exit-permit': lucideNavIcon(LogOut),
  'guide-company-assets': lucideNavIcon(HardDrive),
  'guide-evaluations': lucideNavIcon(Trophy),
  'guide-employee-management': lucideNavIcon(UserPlus),

  // ── Footer ──
  'my-profile': lucideNavIcon(CircleUserRound),
  'audit-logs': lucideNavIcon(ScrollText),
  settings: lucideNavIcon(Settings),

  // ── Sidebar chrome ──
  favorites: lucideNavIcon(Star),
  search: lucideNavIcon(Search),
  'sidebar-pin': lucideNavIcon(Pin),
  'sidebar-unpin': lucideNavIcon(PinOff),
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
  return NAV_ICON_COMPONENTS[iconKey] ?? NAV_ICON_COMPONENTS.projects!;
}

/**
 * Returns the navigation icon element for a key.
 */
export function getNavIcon(iconKey: string): React.ReactNode {
  const Icon = getNavIconComponent(iconKey);
  return <Icon aria-hidden />;
}
