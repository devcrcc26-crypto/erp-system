// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownOutlined } from '@ant-design/icons';
import {
  contextNavSections,
  projectNavHref,
  resolveProjectNavKey,
} from '@/config/navConfig';
import { getNavIcon, navIconClassName, resolveNavIconKey } from '@/lib/navigation/nav-icons';
import {
  canViewProjectNavItem,
  isProjectNavReady,
} from '@/lib/navigation/project-nav-visibility';
import {
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useOptionalRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { tokens } from '@/lib/theme/tokens';
import { CONTEXT_SIDEBAR_WIDTH } from '@/components/ui/shell/shell-layout';

/**
 * Project context sidebar - grouped nav driven by config.
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
  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const lens = useOptionalRoleLens();
  const disciplineScopeBypass = lens?.disciplineScopeBypass ?? epc.disciplineScopeBypass;
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !permLoading && !disciplineScopeBypass,
  );
  const hasAssignedDisciplines = (disciplinesQuery.data?.length ?? 0) > 0;
  const navReady = isProjectNavReady(
    !permLoading,
    disciplineScopeBypass,
    disciplinesQuery.isLoading,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const selectedKey = resolveProjectNavKey(pathname, projectId);

  const navContext = useMemo(
    () => ({
      pm,
      epc,
      hasAssignedDisciplines,
      disciplineScopeBypass,
    }),
    [pm, epc, hasAssignedDisciplines, disciplineScopeBypass],
  );

  const visibleSections = useMemo(
    () => {
      if (!navReady) {
        return [];
      }
      return contextNavSections
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            canViewProjectNavItem(item, navContext),
          ),
        }))
        .filter((group) => group.items.length > 0);
    },
    [navContext, navReady],
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
      className={`shell-context-sidebar relative flex h-full shrink-0 flex-col bg-white ${className}`}
      style={{
        width: CONTEXT_SIDEBAR_WIDTH,
        borderRight: `0.5px solid ${tokens.colorBorder}`,
      }}
      aria-label={t('shell.projectNavigation')}
    >
      <header className="shrink-0 px-3 pb-3 pt-4">
        <p
          className="text-[10px] font-medium uppercase tracking-[0.06em]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('shell.projectSection')}
        </p>
        <h2
          className="mt-1 truncate text-[14px] font-medium tracking-[-0.01em]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {projectName}
        </h2>
      </header>

      <hr style={{ margin: '0 12px', border: 'none', borderTop: `0.5px solid ${tokens.colorBorder}` }} />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={updateScrollHint}
          className="shell-context-scroll h-full overflow-y-auto px-2 py-3"
        >
          {!navReady ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="erp-page-skeleton h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : visibleSections.length === 0 ? (
            <p
              className="px-2.5 py-2 text-[13px]"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('empty.noModules')}
            </p>
          ) : (
            visibleSections.map((group) => (
              <section key={group.key} className="mb-4">
                <h3
                  className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.06em]"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {t(group.labelKey)}
                </h3>
                <ul className="flex flex-col gap-0.5">
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
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] leading-[1.5] no-underline transition-colors',
                            isActive
                              ? 'font-medium'
                              : 'font-normal hover:bg-[var(--color-surface-secondary)]',
                          ].join(' ')}
                          style={
                            isActive
                              ? {
                                  backgroundColor: tokens.colorPrimaryLight,
                                  color: tokens.colorPrimaryHover,
                                }
                              : { color: tokens.colorTextPrimary }
                          }
                        >
                          <span
                            className={navIconClassName}
                            style={
                              isActive
                                ? { color: tokens.colorPrimaryHover }
                                : { color: tokens.colorTextSecondary }
                            }
                          >
                            {getNavIcon(resolveNavIconKey(item.key, item.iconKey))}
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
            className="pointer-events-none absolute bottom-3 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-white"
            style={{
              border: `0.5px solid ${tokens.colorBorder}`,
              color: tokens.colorTextTertiary,
            }}
            aria-hidden
          >
            <DownOutlined className="text-[11px]" />
          </div>
        )}
      </div>
    </aside>
  );
}
