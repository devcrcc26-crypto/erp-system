'use client';

import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import type {
  SidebarGroup,
  SidebarLink,
  SidebarProjectHeader,
} from '@/components/sidebar/sidebar-model';
import SidebarModuleGroup from '@/components/sidebar/SidebarModuleGroup';
import { SIDEBAR_PANEL_WIDTH } from '@/components/sidebar/sidebar.config';
import { getNavIcon } from '@/lib/navigation/nav-icons';

/** Shared rendering hooks the shell hands to every panel. */
export interface SidebarPanelBindings {
  readonly t: (key: string, vars?: Record<string, string | number>) => string;
  /** Keeps element ids unique between the desktop sidebar and the drawer. */
  readonly idPrefix: string;
  readonly renderItem: (link: SidebarLink) => React.ReactNode;
  readonly isGroupCollapsed: (group: SidebarGroup) => boolean;
  readonly toggleGroup: (group: SidebarGroup) => void;
}

/**
 * The contents of a folder (HR, Project Management, Organization, …).
 *
 * - `inline`: expanded sidebar - hangs under its folder row; the folder row
 *   itself is the open/close control.
 * - `docked`: compact sidebar - a full-height column beside the rail with a
 *   heading and an explicit close button. Esc also closes it.
 *
 * Both variants share groups, items and the selected state, so they read as
 * the same component at two zoom levels.
 */
export default function SidebarModulePanel({
  id,
  variant,
  title,
  icon,
  groups = [],
  project = null,
  loading = false,
  bindings,
  onClose,
  children,
}: {
  id: string;
  variant: 'inline' | 'docked';
  title: string;
  /** Docked only - the folder's icon key, shown beside the heading. */
  icon?: string;
  groups?: readonly SidebarGroup[];
  project?: SidebarProjectHeader | null;
  /** Project workspace items are still resolving. */
  loading?: boolean;
  bindings: SidebarPanelBindings;
  /** Docked only - closes the panel and returns focus to its folder. */
  onClose?: () => void;
  /** Replaces the group list (used for search and favorites panels). */
  children?: React.ReactNode;
}): React.ReactNode {
  const { t } = bindings;
  const headingId = `${id}-heading`;

  const body = (
    <>
      {project ? <ProjectCard project={project} t={t} /> : null}
      {loading ? <PanelSkeleton label={t('shell.loadingNavigation')} /> : null}
      {children ??
        groups.map((group) => (
          <SidebarModuleGroup
            key={group.id}
            id={`${bindings.idPrefix}-${group.id}`}
            label={t(group.labelKey)}
            collapsed={bindings.isGroupCollapsed(group)}
            onToggle={() => bindings.toggleGroup(group)}
          >
            {group.items.map((link) => bindings.renderItem(link))}
          </SidebarModuleGroup>
        ))}
    </>
  );

  if (variant === 'inline') {
    return (
      <div id={id} role="group" aria-label={title} className="sb-inline-panel">
        {body}
      </div>
    );
  }

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={headingId}
      className="sb-panel flex h-full shrink-0 flex-col"
      style={{ width: SIDEBAR_PANEL_WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onClose) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="sb-panel-header shrink-0">
        {icon ? (
          <span className="sb-panel-icon" aria-hidden>
            {getNavIcon(icon)}
          </span>
        ) : null}
        {/* The shell focuses this heading (by id) when the panel opens. */}
        <h2 id={headingId} tabIndex={-1} className="sb-panel-title">
          {title}
        </h2>
        {onClose ? (
          <button
            type="button"
            className="sb-icon-button"
            onClick={onClose}
            aria-label={t('shell.closePanel', { name: title })}
          >
            <X aria-hidden size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <div className="sb-scroll min-h-0 flex-1 px-2 py-2">{body}</div>
    </div>
  );
}

function ProjectCard({
  project,
  t,
}: {
  project: SidebarProjectHeader;
  t: SidebarPanelBindings['t'];
}): React.ReactNode {
  return (
    <div className="sb-project-card">
      <p className="sb-project-eyebrow">{t('shell.projectSection')}</p>
      <p className="sb-project-name">
        {project.name}
        {project.nameZh ? (
          <span className="sb-row-context">{project.nameZh}</span>
        ) : null}
      </p>
      <Link href="/projects" className="sb-back-link">
        <ArrowLeft aria-hidden size={14} strokeWidth={2} />
        {t('shell.allProjects')}
      </Link>
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }): React.ReactNode {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 px-2 py-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="sb-skeleton h-8 w-full" />
      ))}
    </div>
  );
}
