'use client';

import './dashboard-v2.css';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from 'antd';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  CalendarPlus,
  CircleUserRound,
  Inbox,
  LayoutDashboard,
  Plane,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import {
  useCanCreateFlight,
  useCanCreateLeave,
  useCanCreateOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import {
  addisParts,
  formatAddisDate,
  greetingPeriod,
} from '@/lib/dashboard/addis-time';
import {
  type DashboardTabId,
  isValidTab,
  resolveDashboardTabs,
} from '@/lib/dashboard/dashboard-roles';
import { useApprovalCategories } from '@/lib/query/approvals';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import MyTeamTab from './tabs/MyTeamTab';
import MyWorkTab from './tabs/MyWorkTab';
import OperationsTab from './tabs/OperationsTab';
import OverviewTab from './tabs/OverviewTab';
import PayrollOtTab from './tabs/PayrollOtTab';

const HOME = 'pages.dashboard.home';
const TAB_PARAM = 'tab';

interface QuickAction {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly visible: boolean;
}

const TAB_LABEL_KEYS: Record<DashboardTabId, string> = {
  overview: 'overview',
  'payroll-ot': 'payrollOt',
  operations: 'operations',
  'my-team': 'myTeam',
  'my-work': 'myWork',
};

const TAB_ICONS: Record<DashboardTabId, LucideIcon> = {
  overview: LayoutDashboard,
  'payroll-ot': BarChart3,
  operations: Briefcase,
  'my-team': Users,
  'my-work': CircleUserRound,
};

function tabDomId(id: DashboardTabId): string {
  return `dv2-tab-${id}`;
}

function panelDomId(id: DashboardTabId): string {
  return `dv2-panel-${id}`;
}

function TabPanelContent({
  tab,
  enabled,
}: {
  tab: DashboardTabId;
  enabled: boolean;
}): React.ReactNode {
  switch (tab) {
    case 'overview':
      return <OverviewTab enabled={enabled} />;
    case 'payroll-ot':
      return <PayrollOtTab enabled={enabled} />;
    case 'operations':
      return <OperationsTab enabled={enabled} />;
    case 'my-team':
      return <MyTeamTab enabled={enabled} />;
    case 'my-work':
      return <MyWorkTab enabled={enabled} />;
    default:
      return null;
  }
}

/**
 * Role-based tabbed home (v2). HR roles get Overview / Payroll & OT /
 * Operations, supervisors get My Team, everyone gets My Work. The active tab
 * lives in `?tab=` so it survives reloads and can be linked to; only the
 * active panel is mounted, so inactive tabs fetch nothing extra. All styles
 * live under `.erp-dashboard-v2` in `dashboard-v2.css`.
 */
function DashboardHomeInner({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const canViewHr = useCanViewHr();
  const canCreateLeave = useCanCreateLeave();
  const canCreateOvertime = useCanCreateOvertime();
  const canCreateFlight = useCanCreateFlight();
  const categoriesQuery = useApprovalCategories(enabled);
  const profileQuery = useCurrentUser();
  const statsQuery = useDashboardOperationalStats(enabled);
  const tabRefs = useRef<Partial<Record<DashboardTabId, HTMLButtonElement | null>>>({});

  useSetHeaderExtra(null);

  const roles = profileQuery.data?.roles;
  const hasTeam = Boolean(statsQuery.data?.myTeam);
  const tabs = useMemo<DashboardTabId[]>(
    () =>
      resolveDashboardTabs({
        roleNames: (roles ?? []).map((role) => role.name),
        canViewHr,
        hasTeam,
      }),
    [roles, canViewHr, hasTeam],
  );

  const rawTab = searchParams.get(TAB_PARAM);
  const defaultTab = tabs[0];
  const activeTab: DashboardTabId = isValidTab(rawTab, tabs) ? rawTab : defaultTab;

  // Roles and team data arrive asynchronously, so only judge a `?tab=` value
  // once both have settled; otherwise a valid deep link to a tab that appears
  // later (e.g. my-team) would be rewritten away.
  const settled =
    (profileQuery.isSuccess || profileQuery.isError) &&
    (statsQuery.isSuccess || statsQuery.isError);

  const hrefForTab = (id: DashboardTabId): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(TAB_PARAM, id);
    return `${pathname}?${params.toString()}`;
  };

  useEffect(() => {
    if (!settled || rawTab === null || isValidTab(rawTab, tabs)) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(TAB_PARAM, defaultTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [settled, rawTab, tabs, defaultTab, searchParams, pathname, router]);

  const selectTab = (id: DashboardTabId): void => {
    if (id !== activeTab) {
      router.replace(hrefForTab(id), { scroll: false });
    }
  };

  const onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab);
    const btn = tabRefs.current[nextTab];
    btn?.focus();
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };

  // A request shortcut needs its category to exist; until the list loads,
  // trust the capability so the row does not flicker.
  const categoryCodes = categoriesQuery.data
    ? new Set(categoriesQuery.data.map((category) => category.code))
    : null;
  const hasCategory = (code: string): boolean =>
    categoryCodes === null || categoryCodes.has(code);

  const quickActions: QuickAction[] = [
    {
      key: 'newLeave',
      href: '/approvals/new/leave-request',
      icon: CalendarPlus,
      visible: canCreateLeave && hasCategory('LEAVE_REQUEST'),
    },
    {
      key: 'newOvertime',
      href: '/approvals/new/overtime',
      icon: Timer,
      visible: canCreateOvertime && hasCategory('OVERTIME_APPLICATION'),
    },
    {
      key: 'newPerDiem',
      href: '/approvals/new/per-diem',
      icon: Wallet,
      visible: categoryCodes !== null && categoryCodes.has('PER_DIEM'),
    },
    {
      key: 'newFlight',
      href: '/approvals/new/flight-application',
      icon: Plane,
      visible: canCreateFlight && hasCategory('FLIGHT_APPLICATION'),
    },
    { key: 'approvalsInbox', href: '/approvals', icon: Inbox, visible: true },
    { key: 'myProfile', href: '/profile', icon: CircleUserRound, visible: true },
  ];

  const now = new Date();
  const firstName = user?.firstName || t('pages.dashboard.hr.greeting.fallbackName');
  const greeting = t(`pages.dashboard.hr.greeting.${greetingPeriod(addisParts(now).hour)}`);

  return (
    <div className="erp-pro-list-page erp-dashboard-v2">
      <header className="erp-pro-card dv2-header">
        <div className="dv2-greeting">
          <p className="dv2-greeting-eyebrow">{t('nav.dashboard')}</p>
          <h1 className="dv2-greeting-title">{`${greeting}, ${firstName}`}</h1>
          <p className="dv2-greeting-date">{formatAddisDate(now, locale)}</p>
        </div>

        <nav aria-label={t(`${HOME}.quickActions`)} className="dv2-actions">
          <ul className="dv2-action-list">
            {quickActions
              .filter((action) => action.visible)
              .map((action) => {
                const Icon = action.icon;
                return (
                  <li key={action.key}>
                    <Link href={action.href} className="dv2-action">
                      <span className="dv2-action-icon" aria-hidden>
                        <Icon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="dv2-action-label">
                        {t(`${HOME}.actions.${action.key}`)}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
      </header>

      {tabs.length > 1 ? (
        <div
          className="dv2-tabs"
          role="tablist"
          aria-label={t(`${HOME}.tabs.label`)}
        >
          {tabs.map((id, index) => {
            const selected = id === activeTab;
            const TabIcon = TAB_ICONS[id];
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[id] = node;
                }}
                type="button"
                role="tab"
                id={tabDomId(id)}
                aria-selected={selected}
                aria-controls={panelDomId(id)}
                tabIndex={selected ? 0 : -1}
                className={`dv2-tab${selected ? ' dv2-tab--active' : ''}`}
                onClick={(e) => {
                  selectTab(id);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'nearest',
                  });
                }}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                <span className="dv2-tab-icon" aria-hidden>
                  <TabIcon size={16} strokeWidth={2} />
                </span>
                <span>{t(`${HOME}.tabs.${TAB_LABEL_KEYS[id]}`)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        key={activeTab}
        role={tabs.length > 1 ? 'tabpanel' : 'region'}
        id={panelDomId(activeTab)}
        aria-labelledby={tabs.length > 1 ? tabDomId(activeTab) : undefined}
        aria-label={tabs.length <= 1 ? t(`${HOME}.tabs.${TAB_LABEL_KEYS[activeTab]}`) : undefined}
        tabIndex={tabs.length > 1 ? 0 : undefined}
        className="dv2-tab-panel"
      >
        <TabPanelContent tab={activeTab} enabled={enabled} />
      </div>
    </div>
  );
}

/**
 * `useSearchParams` opts the page out of static rendering unless it sits in a
 * Suspense boundary, so the tabbed home is wrapped here.
 */
export default function DashboardHome({ enabled }: { enabled: boolean }): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="erp-dashboard-v2">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      }
    >
      <DashboardHomeInner enabled={enabled} />
    </Suspense>
  );
}
