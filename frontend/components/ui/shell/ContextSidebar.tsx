'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuditOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DownOutlined,
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
  contextNavSections,
  projectNavHref,
  resolveProjectNavKey,
} from '@/config/navConfig';
import type { ProjectWorkspaceNavItem } from '@/lib/navigation/project-workspace-nav';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useOptionalRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import type { PmModuleKey } from '@/lib/api/project-management.types';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';

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

  if (
    item.epcSurface === 'engineering' &&
    !disciplineScopeBypass &&
    !hasAssignedDisciplines
  ) {
    return false;
  }

  return true;
}

/**
 * Project context sidebar — grouped nav driven by config.
 */
export default function ContextSidebar({
  projectId,
  projectName,
  onNavigate,
  className = '',
}: {
  projectId: string;
  projectName: string;
  onNavigate?: () => void;
  className?: string;
}): React.ReactNode {
  const pathname = usePathname();
  const { t } = useEpcTranslation();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const lens = useOptionalRoleLens();
  const disciplineScopeBypass = lens?.disciplineScopeBypass ?? epc.disciplineScopeBypass;
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !disciplineScopeBypass,
  );
  const hasAssignedDisciplines = (disciplinesQuery.data?.length ?? 0) > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const selectedKey = resolveProjectNavKey(pathname, projectId);

  const visibleSections = useMemo(
    () =>
      contextNavSections
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            canViewNavItem(
              item,
              pm,
              epc,
              hasAssignedDisciplines,
              disciplineScopeBypass,
            ),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [pm, epc, hasAssignedDisciplines, disciplineScopeBypass],
  );

  const updateScrollHint = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) {
      setShowScrollHint(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    setShowScrollHint(hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    updateScrollHint();
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollHint, visibleSections]);

  return (
    <aside
      className={`relative flex h-full w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white ${className}`}
      aria-label="Project navigation"
    >
      <header className="shrink-0 px-4 pb-4 pt-5">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: tokens.colorTextSecondary }}
        >
          Project
        </p>
        <h2
          className="mt-1 truncate text-lg font-bold"
          style={{ color: tokens.colorTextPrimary }}
        >
          {projectName}
        </h2>
      </header>

      <hr className="mx-4 border-slate-200" />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={updateScrollHint}
          className={`${layout.projectSidebarMenu} shell-context-scroll h-full overflow-y-auto px-2 py-4`}
        >
          {visibleSections.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">{t('empty.noModules')}</p>
          ) : (
            visibleSections.map((group) => (
              <section key={group.key} className="mb-5">
                <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {t(group.labelKey)}
                </h3>
                <ul className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const href = projectNavHref(projectId, item.pathSuffix);
                    const isActive = selectedKey === item.key;
                    const label = t(item.labelKey);

                    return (
                      <li key={item.key}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          aria-current={isActive ? 'page' : undefined}
                          className={[
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                            isActive
                              ? 'font-semibold'
                              : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                          ].join(' ')}
                          style={
                            isActive
                              ? {
                                  backgroundColor: tokens.colorPrimaryLight,
                                  color: tokens.colorPrimaryHover,
                                }
                              : undefined
                          }
                        >
                          <span className="flex shrink-0 text-base leading-none">
                            {NAV_ICONS[item.key] ?? <ProjectOutlined />}
                          </span>
                          <span className="truncate">{label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {showScrollHint && (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-md"
            aria-hidden
          >
            <DownOutlined className="text-xs" />
          </div>
        )}
      </div>
    </aside>
  );
}
