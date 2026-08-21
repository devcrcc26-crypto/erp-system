// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DownOutlined,
} from '@ant-design/icons';
import {
  buildIconRailNav,
  flattenIconRailNav,
  resolveIconRailKey,
  type IconRailGroup,
  type IconRailItem,
} from '@/config/navConfig';
import { getNavIcon, navIconClassName } from '@/lib/navigation/nav-icons';
import {
  useCanViewMyComments,
  useCanViewMyWork,
  useCanViewReviewInbox,
  useCanViewChangeRequests,
  useCanViewCorrespondence,
  useCanViewExternalReleases,
  useCanViewDailyLogs,
  useCanViewIssues,
  useCanViewRisks,
  useCanViewPunchList,
  useCanViewMeetings,
  useCanViewRfis,
  useCanViewSubmittals,
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import {
  useCanManagePerDiemRates,
  useCanViewAuditLogs,
  useCanManageRoles,
  useCanManageUsers,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import {
  useCanViewDepartmentsNav,
  useCanViewDisciplinesCatalogNav,
} from '@/hooks/use-org-nav-access';
import { canViewGlobalNavKey } from '@/lib/navigation/project-nav-visibility';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSidebarGroupOpen } from '@/hooks/useSidebarGroupOpen';
import { tokens } from '@/lib/theme/tokens';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';

function railItemClass(isActive: boolean, isExpanded: boolean): string {
  const base =
    'relative flex shrink-0 items-center no-underline transition-colors duration-150';
  if (isExpanded) {
    return [
      base,
      'w-full gap-2.5 rounded-md px-3 py-2 text-[14px] leading-[22px]',
      isActive ? 'font-semibold' : 'font-normal',
    ].join(' ');
  }
  return [
    base,
    'mx-auto h-9 w-9 justify-center rounded-md text-[16px]',
    isActive ? 'font-semibold' : 'font-normal',
  ].join(' ');
}

function railItemStyle(isActive: boolean): React.CSSProperties {
  if (isActive) {
    return {
      backgroundColor: tokens.colorSidebarActive,
      color: tokens.colorSidebarTextActive,
      boxShadow: `inset 3px 0 0 ${tokens.colorSidebarAccent}`,
      fontFamily: tokens.fontFamily,
    };
  }
  return {
    color: tokens.colorSidebarText,
    fontFamily: tokens.fontFamily,
  };
}

function RailNavButton({
  item,
  label,
  isActive,
  isExpanded,
  onNavigate,
}: {
  item: IconRailItem;
  label: string;
  isActive: boolean;
  isExpanded: boolean;
  onNavigate?: () => void;
}): React.ReactNode {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={[
        railItemClass(isActive, isExpanded),
        !isActive && isExpanded
          ? 'hover:bg-[var(--color-sidebar-hover)]'
          : '',
        !isActive && !isExpanded
          ? 'hover:bg-[var(--color-sidebar-hover)]'
          : '',
      ].join(' ')}
      style={railItemStyle(isActive)}
    >
      <span
        className={navIconClassName}
        style={
          isActive
            ? { color: tokens.colorSidebarAccent }
            : { color: tokens.colorSidebarText }
        }
      >
        {getNavIcon(item.iconKey)}
      </span>
      <span
        className={[
          'truncate transition-all duration-200 ease-in-out',
          isExpanded ? 'w-auto opacity-100' : 'w-0 overflow-hidden opacity-0',
        ].join(' ')}
        style={{ fontFamily: tokens.fontFamily }}
      >
        {label}
      </span>
    </Link>
  );
}

function RailGroupHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mb-1 mt-3 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-[var(--color-sidebar-hover)] first:mt-0"
      style={{ color: tokens.colorSidebarGroupLabel, fontFamily: tokens.fontFamily }}
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[0.04em]">
        {label}
      </span>
      <DownOutlined
        className="shrink-0 text-[10px] transition-transform duration-150"
        style={{
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}
      />
    </button>
  );
}

function RailNavGroup({
  group,
  visibleItems,
  selectedKey,
  isExpanded,
  onNavigate,
  t,
}: {
  group: IconRailGroup;
  visibleItems: IconRailItem[];
  selectedKey: string;
  isExpanded: boolean;
  onNavigate?: () => void;
  t: (key: string) => string;
}): React.ReactNode {
  const { open, toggle } = useSidebarGroupOpen(
    group.storageKey,
    group.defaultOpen,
  );
  const hasActiveChild = visibleItems.some((item) => item.key === selectedKey);
  const showItems = open || hasActiveChild;

  if (visibleItems.length === 0) {
    return null;
  }

  if (!isExpanded) {
    return (
      <>
        {visibleItems.map((item) => (
          <RailNavButton
            key={item.key}
            item={item}
            label={t(item.labelKey)}
            isActive={selectedKey === item.key}
            isExpanded={false}
            onNavigate={onNavigate}
          />
        ))}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-0.5 pb-1">
      <RailGroupHeader
        label={t(group.labelKey)}
        open={showItems}
        onToggle={toggle}
      />
      {showItems
        ? visibleItems.map((item) => (
            <RailNavButton
              key={item.key}
              item={item}
              label={t(item.labelKey)}
              isActive={selectedKey === item.key}
              isExpanded={isExpanded}
              onNavigate={onNavigate}
            />
          ))
        : null}
    </section>
  );
}

/**
 * Shared main navigation panel - icon rail (desktop) and drawer (mobile).
 */
export default function MainNavPanel({
  isExpanded,
  onNavigate,
}: {
  isExpanded: boolean;
  onNavigate?: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();
  const canViewMyWork = useCanViewMyWork();
  const canViewSubmittals = useCanViewSubmittals();
  const canViewExternalReleases = useCanViewExternalReleases();
  const canViewChangeRequests = useCanViewChangeRequests();
  const canViewRfis = useCanViewRfis();
  const canViewIssues = useCanViewIssues();
  const canViewRisks = useCanViewRisks();
  const canViewPunchList = useCanViewPunchList();
  const canViewMeetings = useCanViewMeetings();
  const canViewCorrespondence = useCanViewCorrespondence();
  const canViewDailyLogs = useCanViewDailyLogs();
  const canViewAuditLogs = useCanViewAuditLogs();
  const canViewHr = useCanViewHr();
  const canManageUsers = useCanManageUsers();
  const canManageRoles = useCanManageRoles();
  const canViewDepartments = useCanViewDepartmentsNav();
  const canViewPositions = useCanViewDepartmentsNav();
  const canViewDisciplinesCatalog = useCanViewDisciplinesCatalogNav();
  const canManagePerDiemRates = useCanManagePerDiemRates();

  const navStructure = buildIconRailNav({
    canViewReviewInbox: !permLoading && canViewReviewInbox,
    canViewMyComments: !permLoading && canViewMyComments,
    canViewMyWork: !permLoading && canViewMyWork,
    canViewSubmittals: !permLoading && canViewSubmittals,
    canViewExternalReleases: !permLoading && canViewExternalReleases,
    canViewChangeRequests: !permLoading && canViewChangeRequests,
    canViewRfis: !permLoading && canViewRfis,
    canViewIssues: !permLoading && canViewIssues,
    canViewRisks: !permLoading && canViewRisks,
    canViewPunchList: !permLoading && canViewPunchList,
    canViewMeetings: !permLoading && canViewMeetings,
    canViewCorrespondence: !permLoading && canViewCorrespondence,
    canViewDailyLogs: !permLoading && canViewDailyLogs,
    canViewApprovals: !permLoading,
    canViewHr: !permLoading && canViewHr,
    canViewAuditLogs: !permLoading && canViewAuditLogs,
    canManageUsers: !permLoading && canManageUsers,
    canManageRoles: !permLoading && canManageRoles,
    canViewProjects: !permLoading && pm.projects.canView,
    canViewDepartments: !permLoading && canViewDepartments,
    canViewPositions: !permLoading && canViewPositions,
    canViewDisciplinesCatalog: !permLoading && canViewDisciplinesCatalog,
    canManagePerDiemRates: !permLoading && canManagePerDiemRates,
  });

  function isItemVisible(item: IconRailItem): boolean {
    return item.visible && canViewGlobalNavKey(item.key, epc, pm);
  }

  const visibleTopItems = navStructure.topItems.filter(isItemVisible);
  const visibleGroups = navStructure.groups.map((group) => ({
    group,
    items: group.items.filter(isItemVisible),
  }));
  const visibleStandalone = navStructure.standalone.filter(isItemVisible);
  const visibleNavItems = flattenIconRailNav({
    topItems: visibleTopItems,
    groups: visibleGroups.map(({ group, items }) => ({ ...group, items })),
    standalone: visibleStandalone,
  });
  const selectedKey = resolveIconRailKey(pathname, visibleNavItems);

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: tokens.colorSidebarBg,
        borderRight: `0.5px solid ${tokens.colorSidebarBorder}`,
      }}
    >
      <div
        className={[
          'flex shrink-0 items-center',
          isExpanded ? 'px-3' : 'justify-center px-2',
        ].join(' ')}
        style={{
          height: SHELL_TOP_HEADER_HEIGHT,
          borderBottom: `1px solid ${tokens.colorSidebarBorder}`,
        }}
      >
        {isExpanded ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-medium text-white"
              style={{ backgroundColor: tokens.colorSidebarAccent }}
              aria-hidden
            >
              {t('shell.brandShort')}
            </div>
            <h1
              className="m-0 truncate text-[14px] font-semibold tracking-[-0.01em]"
              style={{
                color: tokens.colorSidebarTextActive,
                fontFamily: tokens.fontFamily,
              }}
            >
              {t('shell.brandTitle')}
            </h1>
          </div>
        ) : (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-medium text-white"
            style={{ backgroundColor: tokens.colorSidebarAccent }}
            title={t('shell.brandTitle')}
            aria-label={t('shell.brandWorkspace')}
          >
            {t('shell.brandShort')}
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3">
        {permLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className={[
                'erp-page-skeleton rounded-md',
                isExpanded ? 'h-9 w-full' : 'mx-auto h-9 w-9',
              ].join(' ')}
            />
          ))
        ) : (
          <>
            {visibleTopItems.length > 0 ? (
              <section className="mb-2 flex flex-col gap-0.5">
                {visibleTopItems.map((item) => (
                  <RailNavButton
                    key={item.key}
                    item={item}
                    label={t(item.labelKey)}
                    isActive={selectedKey === item.key}
                    isExpanded={isExpanded}
                    onNavigate={onNavigate}
                  />
                ))}
              </section>
            ) : null}

            {visibleGroups.map(({ group, items }) => (
              <RailNavGroup
                key={group.key}
                group={group}
                visibleItems={items}
                selectedKey={selectedKey}
                isExpanded={isExpanded}
                onNavigate={onNavigate}
                t={t}
              />
            ))}

            {visibleStandalone.length > 0 ? (
              <section
                className={[
                  'flex flex-col gap-0.5',
                  isExpanded ? 'mt-3 pt-3' : 'mt-2',
                ].join(' ')}
                style={
                  isExpanded
                    ? { borderTop: `1px solid ${tokens.colorSidebarBorder}` }
                    : undefined
                }
              >
                {visibleStandalone.map((item) => (
                  <RailNavButton
                    key={item.key}
                    item={item}
                    label={t(item.labelKey)}
                    isActive={selectedKey === item.key}
                    isExpanded={isExpanded}
                    onNavigate={onNavigate}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </nav>
    </div>
  );
}
