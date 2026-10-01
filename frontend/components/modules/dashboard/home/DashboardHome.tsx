'use client';

import './dashboard-v2.css';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarPlus,
  CircleUserRound,
  Inbox,
  Plane,
  Timer,
  Wallet,
} from 'lucide-react';
import {
  useCanAccessOvertime,
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
import { useApprovalCategories } from '@/lib/query/approvals';
import { useAuthStore } from '@/stores/auth.store';
import {
  AttendanceWidget,
  LeaveBalanceWidget,
  MyEvaluationWidget,
  MyRequestsWidget,
  OvertimeWidget,
  PendingApprovalsWidget,
} from './PersonalWidgets';
import {
  AttendanceReviewWidget,
  ContractsExpiringWidget,
  EvaluationInboxWidget,
  useLeadEvaluations,
} from './RoleWidgets';
import { rowSpans } from './layout';

const HOME = 'pages.dashboard.home';

interface QuickAction {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly visible: boolean;
}

/**
 * Personal widget home (v2). Every widget fetches on its own; widgets for
 * modules the user cannot open are not rendered at all. All styles live
 * under `.erp-dashboard-v2` in `dashboard-v2.css`.
 */
export default function DashboardHome({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const canViewHr = useCanViewHr();
  const canAccessOvertime = useCanAccessOvertime();
  const canCreateLeave = useCanCreateLeave();
  const canCreateOvertime = useCanCreateOvertime();
  const canCreateFlight = useCanCreateFlight();
  const categoriesQuery = useApprovalCategories(enabled);
  // A lead is anyone with evaluations assigned as Discipline / Team Lead.
  const { isLead } = useLeadEvaluations(enabled);

  useSetHeaderExtra(null);

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

  const smallWidgets = [
    { key: 'leave', Widget: LeaveBalanceWidget, visible: true },
    { key: 'attendance', Widget: AttendanceWidget, visible: true },
    { key: 'overtime', Widget: OvertimeWidget, visible: canAccessOvertime },
    { key: 'evaluation', Widget: MyEvaluationWidget, visible: true },
    { key: 'evaluationInbox', Widget: EvaluationInboxWidget, visible: isLead },
  ].filter((widget) => widget.visible);
  const smallSpans = rowSpans(smallWidgets.length);

  const now = new Date();
  const firstName = user?.firstName || t('pages.dashboard.hr.greeting.fallbackName');
  const greeting = t(`pages.dashboard.hr.greeting.${greetingPeriod(addisParts(now).hour)}`);

  return (
    <div className="erp-dashboard-v2">
      <div className="dv2-top">
        <div className="dv2-greeting">
          <h1 className="dv2-greeting-title">{`${greeting}, ${firstName}`}</h1>
          <p className="dv2-greeting-date">{formatAddisDate(now, locale)}</p>
        </div>

        <nav aria-label={t(`${HOME}.quickActions`)} className="dv2-actions">
          <p className="dv2-label m-0" aria-hidden>
            {t(`${HOME}.quickActions`)}
          </p>
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
      </div>

      <div className="dv2-grid">
        <PendingApprovalsWidget enabled={enabled} />
        <MyRequestsWidget enabled={enabled} />
        {smallWidgets.map(({ key, Widget }, index) => (
          <Widget key={key} enabled={enabled} span={smallSpans[index]} />
        ))}
        {canViewHr ? <ContractsExpiringWidget enabled={enabled} /> : null}
        {canViewHr ? <AttendanceReviewWidget enabled={enabled} /> : null}
      </div>
    </div>
  );
}
