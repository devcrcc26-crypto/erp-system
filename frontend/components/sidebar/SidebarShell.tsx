'use client';

import './sidebar.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Drawer } from 'antd';
import { X } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import SidebarModuleGroup from '@/components/sidebar/SidebarModuleGroup';
import SidebarModuleItem from '@/components/sidebar/SidebarModuleItem';
import SidebarModulePanel, {
  type SidebarPanelBindings,
} from '@/components/sidebar/SidebarModulePanel';
import SidebarRailItem from '@/components/sidebar/SidebarRailItem';
import SidebarSearch, { SidebarSearchResults } from '@/components/sidebar/SidebarSearch';
import {
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_CONFIG,
  SIDEBAR_DRAWER_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_MAX_FAVORITES,
  type SidebarBadgeSource,
} from '@/components/sidebar/sidebar.config';
import {
  buildSidebarModel,
  flattenSidebarModel,
  resolveActiveLink,
  searchSidebar,
  type SidebarEntry,
  type SidebarFolder,
  type SidebarGroup,
  type SidebarLink,
  type SidebarLocatedLink,
  type SidebarProjectContext,
} from '@/components/sidebar/sidebar-model';
import {
  useSidebarBadgeCounts,
  useSidebarPermissions,
  useSidebarPreferences,
  useSidebarProjectContext,
  type SidebarProjectInput,
} from '@/components/sidebar/use-sidebar-data';
import { SHELL_TOP_HEADER_HEIGHT } from '@/components/ui/shell/shell-layout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsLgUp } from '@/hooks/useMediaQuery';

/** Pseudo panel ids for the compact rail's search and favorites panels. */
const SEARCH_PANEL = 'search';
const FAVORITES_PANEL = 'favorites';
const FAVORITES_GROUP_ID = 'favorites';

const BADGE_LABEL_KEYS: Record<SidebarBadgeSource, string> = {
  pendingApprovals: 'shell.badgePendingApprovals',
  pendingEvaluationActions: 'shell.badgePendingEvaluations',
};

type Surface = 'desktop' | 'drawer';

/** DOM ids — focus is moved by id so no refs are read during render. */
const searchInputId = (surface: Surface): string => `${surface}-sidebar-search`;
const searchResultsId = (surface: Surface): string => `${surface}-sidebar-results`;
const panelId = (surface: Surface, id: string): string => `${surface}-panel-${id}`;
const folderButtonId = (id: string): string => `desktop-folder-${id}`;

/** Focuses an element once React has committed and the browser has laid out. */
function focusSoon(elementId: string, select = false): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const element = document.getElementById(elementId);
      element?.focus();
      if (select && element instanceof HTMLInputElement) {
        element.select();
      }
    }),
  );
}

interface PanelSyncInput {
  readonly current: string | null;
  readonly compact: boolean;
  readonly becameCompact: boolean;
  readonly navigated: boolean;
  readonly folderChanged: boolean;
  readonly activeFolderId: string | null;
  readonly projectFolderId: string | null;
}

/**
 * Which panel should be open after a route or mode change.
 * Expanded: follow the route's folder. Compact: close panels the route has
 * left and never auto-open — except a project's own navigation.
 */
function nextOpenPanel(input: PanelSyncInput): string | null {
  const { current, compact, activeFolderId, projectFolderId } = input;
  const isProjectFolder = activeFolderId !== null && activeFolderId === projectFolderId;

  if (input.becameCompact) {
    return current !== null && current === activeFolderId && isProjectFolder ? current : null;
  }
  if (!compact) {
    return input.folderChanged ? activeFolderId : current;
  }
  if (current === SEARCH_PANEL || current === FAVORITES_PANEL) {
    return input.navigated ? null : current;
  }
  if (current !== null && current !== activeFolderId) {
    return null;
  }
  if (input.folderChanged && isProjectFolder) {
    return activeFolderId;
  }
  return current;
}

/**
 * The application sidebar: one `<nav>` holding every destination.
 *
 * Desktop (lg+): expanded (labels, folders open inline) or compact (icon +
 * caption rail, folders open a docked panel). Below lg: the expanded tree in
 * a drawer with a visible close button. Everything rendered comes from
 * `sidebar.config.ts` filtered by the session's permissions.
 */
export default function SidebarShell({
  mobileOpen,
  onMobileOpenChange,
  project,
}: {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  /** Current project when on a `/projects/:id` route the user may browse. */
  project: SidebarProjectInput | null;
}): React.ReactNode {
  const pathname = usePathname();
  const { t } = useEpcTranslation();
  const isLgUp = useIsLgUp();
  const prefs = useSidebarPreferences();
  const { collapsedGroups, setGroupCollapsed } = prefs;
  const { permissions, ready } = useSidebarPermissions();
  const badgeCounts = useSidebarBadgeCounts();
  const { context: projectContext, loading: projectLoading } =
    useSidebarProjectContext(project);

  // While project items resolve, still show the project card (+ skeleton).
  const effectiveProjectContext = useMemo(
    (): SidebarProjectContext | null =>
      projectContext ??
      (project
        ? {
            header: { projectId: project.id, name: project.name, nameZh: project.nameZh },
            groups: [],
          }
        : null),
    [projectContext, project],
  );

  const model = useMemo(
    () => buildSidebarModel(SIDEBAR_CONFIG, permissions, effectiveProjectContext),
    [permissions, effectiveProjectContext],
  );
  const links = useMemo(() => flattenSidebarModel(model), [model]);
  const active = useMemo(() => resolveActiveLink(pathname, links), [pathname, links]);
  const activeLinkId = active?.link.id ?? null;
  const activeFolderId = active?.folderId ?? null;
  const activeGroupId = active?.groupId ?? null;
  const projectFolderId =
    model.primary.find(
      (entry): entry is SidebarFolder => entry.kind === 'folder' && entry.project !== null,
    )?.id ?? null;

  const compact = prefs.mode === 'compact';
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSidebar(links, query, t), [links, query, t]);

  const favoriteLinks = useMemo(
    () =>
      prefs.favoriteIds
        .map((id) => links.find((entry) => entry.link.id === id)?.link)
        .filter((link): link is SidebarLink => link !== undefined),
    [prefs.favoriteIds, links],
  );

  // ── Route / mode sync (adjusted during render, not in an effect) ──
  const [synced, setSynced] = useState<{
    pathname: string | null;
    folderId: string | null | undefined;
    compact: boolean;
  }>({ pathname: null, folderId: undefined, compact });

  if (
    synced.pathname !== pathname ||
    synced.folderId !== activeFolderId ||
    synced.compact !== compact
  ) {
    const navigated = synced.pathname !== null && synced.pathname !== pathname;
    setSynced({ pathname, folderId: activeFolderId, compact });
    if (navigated && query !== '') {
      setQuery('');
    }
    setOpenPanel(
      nextOpenPanel({
        current: openPanel,
        compact,
        becameCompact: compact && !synced.compact,
        navigated,
        folderChanged: synced.folderId !== activeFolderId,
        activeFolderId,
        projectFolderId,
      }),
    );
  }

  // Keep the current page's group open when the page changes, without
  // overriding the user's stored choice for later.
  const [revealed, setRevealed] = useState<{
    linkId: string | null;
    groupId: string | null;
  }>({ linkId: null, groupId: null });
  if (revealed.linkId !== activeLinkId) {
    setRevealed({ linkId: activeLinkId, groupId: activeGroupId });
  }

  // ── Cmd/Ctrl + K ──
  const drawerFocusPending = useRef(false);

  function openSearch(): void {
    if (!isLgUp) {
      if (mobileOpen) {
        focusSoon(searchInputId('drawer'));
      } else {
        drawerFocusPending.current = true;
        onMobileOpenChange(true);
      }
      return;
    }
    if (compact) {
      setOpenPanel(SEARCH_PANEL);
    }
    focusSoon(searchInputId('desktop'), true);
  }

  // Subscribes once; always sees the latest mode and drawer state.
  const onSearchShortcut = useEffectEvent((event: KeyboardEvent): void => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      openSearch();
    }
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      onSearchShortcut(event);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Panel + mode actions ──
  function toggleFolder(id: string, surface: Surface): void {
    const opening = openPanel !== id;
    setOpenPanel(opening ? id : null);
    if (opening && compact && surface === 'desktop') {
      focusSoon(
        id === SEARCH_PANEL
          ? searchInputId('desktop')
          : `${panelId('desktop', id)}-heading`,
      );
    }
  }

  function closeDockedPanel(id: string): void {
    setOpenPanel(null);
    focusSoon(folderButtonId(id));
  }

  function toggleMode(): void {
    if (compact) {
      prefs.setMode('expanded');
      if (openPanel === SEARCH_PANEL || openPanel === FAVORITES_PANEL) {
        setOpenPanel(null);
      }
    } else {
      prefs.setMode('compact');
      setOpenPanel(null);
    }
  }

  const closeDrawer = useCallback(
    (): void => onMobileOpenChange(false),
    [onMobileOpenChange],
  );

  // ── Rendering helpers ──
  function isGroupCollapsed(group: SidebarGroup): boolean {
    if (group.id === revealed.groupId) {
      return false;
    }
    return collapsedGroups[group.id] ?? group.defaultCollapsed;
  }

  function toggleGroup(group: SidebarGroup): void {
    const collapsed = isGroupCollapsed(group);
    if (group.id === revealed.groupId) {
      setRevealed({ linkId: revealed.linkId, groupId: null });
    }
    setGroupCollapsed(group.id, !collapsed);
  }

  function badgeFor(link: SidebarLink): { count: number; label: string } {
    const count = link.badge ? (badgeCounts[link.badge] ?? 0) : 0;
    return {
      count,
      label: link.badge ? t(BADGE_LABEL_KEYS[link.badge], { count }) : '',
    };
  }

  function renderItem(
    link: SidebarLink,
    onNavigate?: () => void,
    options: { context?: string; searchResult?: boolean } = {},
  ): React.ReactNode {
    const label = t(link.labelKey);
    const badge = badgeFor(link);
    return (
      <SidebarModuleItem
        key={link.id}
        link={link}
        label={label}
        active={activeLinkId === link.id}
        onNavigate={onNavigate}
        context={options.context}
        searchResult={options.searchResult}
        badgeCount={badge.count}
        badgeLabel={badge.label}
        comingSoonLabel={t('placeholder.comingSoon')}
        favorite={
          link.pinnable && !options.searchResult
            ? {
                pinned: prefs.favoriteIds.includes(link.id),
                canPin: prefs.favoriteIds.length < SIDEBAR_MAX_FAVORITES,
                onToggle: () => prefs.toggleFavorite(link.id),
                pinLabel: t('shell.pinItem', { name: label }),
                unpinLabel: t('shell.unpinItem', { name: label }),
                fullLabel: t('shell.favoritesFull', { max: SIDEBAR_MAX_FAVORITES }),
              }
            : undefined
        }
      />
    );
  }

  function bindingsFor(surface: Surface, onNavigate?: () => void): SidebarPanelBindings {
    return {
      t,
      idPrefix: surface,
      isGroupCollapsed,
      toggleGroup,
      renderItem: (link) => renderItem(link, onNavigate),
    };
  }

  function resultContext(result: SidebarLocatedLink): string | undefined {
    const parts = [result.folderLabelKey, result.groupLabelKey]
      .filter((key): key is string => key !== null)
      .map((key) => t(key));
    return parts.length > 0 ? parts.join(' › ') : undefined;
  }

  function renderResults(surface: Surface, onNavigate?: () => void): React.ReactNode {
    return (
      <SidebarSearchResults
        id={searchResultsId(surface)}
        inputId={searchInputId(surface)}
        empty={results.length === 0}
        emptyLabel={t('shell.noNavResults')}
      >
        {results.map((result) =>
          renderItem(result.link, onNavigate, {
            context: resultContext(result),
            searchResult: true,
          }),
        )}
      </SidebarSearchResults>
    );
  }

  function renderSearchField(
    surface: Surface,
    onNavigate?: () => void,
    onEscapeEmpty?: () => void,
  ): React.ReactNode {
    return (
      <SidebarSearch
        query={query}
        onQueryChange={setQuery}
        results={results}
        inputId={searchInputId(surface)}
        resultsId={searchResultsId(surface)}
        onNavigate={onNavigate}
        onEscapeEmpty={onEscapeEmpty}
        t={t}
      />
    );
  }

  function renderEntry(
    entry: SidebarEntry,
    surface: Surface,
    isCompact: boolean,
    onNavigate?: () => void,
  ): React.ReactNode {
    const label = t(entry.labelKey);

    if (entry.kind === 'link') {
      if (entry.href === null) {
        return null;
      }
      const badge = badgeFor(entry);
      return (
        <li key={entry.id}>
          <SidebarRailItem
            kind="link"
            href={entry.href}
            icon={entry.icon}
            label={label}
            caption={entry.shortLabelKey ? t(entry.shortLabelKey) : undefined}
            compact={isCompact}
            active={activeLinkId === entry.id}
            badgeCount={badge.count}
            badgeLabel={badge.label}
            onNavigate={onNavigate}
          />
        </li>
      );
    }

    const controlsId = panelId(surface, entry.id);
    const open = openPanel === entry.id;
    return (
      <li key={entry.id}>
        <SidebarRailItem
          kind="folder"
          icon={entry.icon}
          label={label}
          caption={entry.shortLabelKey ? t(entry.shortLabelKey) : undefined}
          compact={isCompact}
          active={activeFolderId === entry.id}
          open={open}
          controlsId={controlsId}
          onToggle={() => toggleFolder(entry.id, surface)}
          buttonId={surface === 'desktop' ? folderButtonId(entry.id) : undefined}
        />
        {!isCompact && open ? (
          <SidebarModulePanel
            id={controlsId}
            variant="inline"
            title={label}
            groups={entry.groups}
            project={entry.project}
            loading={entry.project !== null && projectLoading}
            bindings={bindingsFor(surface, onNavigate)}
          />
        ) : null}
      </li>
    );
  }

  function renderUtility(
    surface: Surface,
    isCompact: boolean,
    onNavigate?: () => void,
  ): React.ReactNode {
    if (model.utility.length === 0) {
      return null;
    }
    return (
      <div className="sb-divider shrink-0 px-2 py-2">
        <ul className="sb-list">
          {model.utility.map((entry) => renderEntry(entry, surface, isCompact, onNavigate))}
        </ul>
      </div>
    );
  }

  /** Expanded desktop sidebar and the mobile drawer share this tree. */
  function renderExpandedTree(surface: Surface, onNavigate?: () => void): React.ReactNode {
    const searching = query.trim().length > 0;
    const favoritesCollapsed = collapsedGroups[FAVORITES_GROUP_ID] ?? false;
    return (
      <>
        <div className="shrink-0 px-3 pb-2 pt-3">{renderSearchField(surface, onNavigate)}</div>
        <div className="sb-scroll min-h-0 flex-1 px-2 pb-2">
          {!ready ? (
            <RailSkeleton compact={false} label={t('shell.loadingNavigation')} />
          ) : searching ? (
            renderResults(surface, onNavigate)
          ) : (
            <>
              {favoriteLinks.length > 0 ? (
                <div className="mb-2">
                  <SidebarModuleGroup
                    id={`${surface}-${FAVORITES_GROUP_ID}`}
                    label={t('shell.favorites')}
                    collapsed={favoritesCollapsed}
                    onToggle={() => setGroupCollapsed(FAVORITES_GROUP_ID, !favoritesCollapsed)}
                  >
                    {favoriteLinks.map((link) => renderItem(link, onNavigate))}
                  </SidebarModuleGroup>
                </div>
              ) : null}
              <ul className="sb-list">
                {model.primary.map((entry) => renderEntry(entry, surface, false, onNavigate))}
              </ul>
            </>
          )}
        </div>
        {renderUtility(surface, false, onNavigate)}
      </>
    );
  }

  function renderCompactRail(): React.ReactNode {
    return (
      <>
        <ul className="sb-list shrink-0 px-2 pt-2">
          <li>
            <SidebarRailItem
              kind="folder"
              icon="search"
              label={t('shell.search')}
              compact
              active={false}
              open={openPanel === SEARCH_PANEL}
              controlsId={panelId('desktop', SEARCH_PANEL)}
              onToggle={() => toggleFolder(SEARCH_PANEL, 'desktop')}
              buttonId={folderButtonId(SEARCH_PANEL)}
            />
          </li>
          {favoriteLinks.length > 0 ? (
            <li>
              <SidebarRailItem
                kind="folder"
                icon="favorites"
                label={t('shell.favorites')}
                compact
                active={false}
                open={openPanel === FAVORITES_PANEL}
                controlsId={panelId('desktop', FAVORITES_PANEL)}
                onToggle={() => toggleFolder(FAVORITES_PANEL, 'desktop')}
                buttonId={folderButtonId(FAVORITES_PANEL)}
              />
            </li>
          ) : null}
        </ul>
        <div className="sb-scroll min-h-0 flex-1 px-2 py-2">
          {!ready ? (
            <RailSkeleton compact label={t('shell.loadingNavigation')} />
          ) : (
            <ul className="sb-list">
              {model.primary.map((entry) => renderEntry(entry, 'desktop', true))}
            </ul>
          )}
        </div>
        {renderUtility('desktop', true)}
      </>
    );
  }

  function renderDockedPanel(): React.ReactNode {
    if (!compact || openPanel === null) {
      return null;
    }
    const panel = openPanel;
    const bindings = bindingsFor('desktop');
    const close = (): void => closeDockedPanel(panel);

    if (panel === SEARCH_PANEL) {
      return (
        <SidebarModulePanel
          id={panelId('desktop', SEARCH_PANEL)}
          variant="docked"
          title={t('shell.searchNavigation')}
          bindings={bindings}
          onClose={close}
        >
          <div className="px-1 pb-2">{renderSearchField('desktop', undefined, close)}</div>
          {query.trim() ? (
            renderResults('desktop')
          ) : (
            <p className="sb-empty">{t('shell.searchHint')}</p>
          )}
        </SidebarModulePanel>
      );
    }

    if (panel === FAVORITES_PANEL) {
      if (favoriteLinks.length === 0) {
        return null;
      }
      return (
        <SidebarModulePanel
          id={panelId('desktop', FAVORITES_PANEL)}
          variant="docked"
          title={t('shell.favorites')}
          bindings={bindings}
          onClose={close}
        >
          <ul className="sb-list">{favoriteLinks.map((link) => renderItem(link))}</ul>
        </SidebarModulePanel>
      );
    }

    const folder = [...model.primary, ...model.utility].find(
      (entry): entry is SidebarFolder => entry.kind === 'folder' && entry.id === panel,
    );
    if (!folder) {
      return null;
    }
    return (
      <SidebarModulePanel
        id={panelId('desktop', folder.id)}
        variant="docked"
        title={t(folder.labelKey)}
        groups={folder.groups}
        project={folder.project}
        loading={folder.project !== null && projectLoading}
        bindings={bindings}
        onClose={close}
      />
    );
  }

  return (
    <>
      <nav
        aria-label={t('shell.mainNavigation')}
        className="sb-theme relative z-40 hidden h-full shrink-0 lg:flex"
        data-mode={prefs.mode}
      >
        <div
          className="sb-rail flex h-full min-h-0 flex-col"
          style={{ width: compact ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
        >
          <div
            className={`flex shrink-0 items-center px-4 ${compact ? 'justify-center' : ''}`}
            style={{
              height: SHELL_TOP_HEADER_HEIGHT,
              borderBottom: '1px solid var(--sb-border)',
            }}
          >
            <Link
              href="/"
              aria-label={t('shell.brandWorkspace')}
              className="inline-flex items-center gap-2.5 rounded-md"
            >
              <BrandLogo size={24} onDark />
              {compact ? null : (
                <span className="text-[15px] font-semibold text-white">
                  {t('shell.brandTitle')}
                </span>
              )}
            </Link>
          </div>

          {compact ? renderCompactRail() : renderExpandedTree('desktop')}

          <div className="sb-divider shrink-0 px-2 py-2">
            <SidebarRailItem
              kind="action"
              icon={compact ? 'sidebar-expand' : 'sidebar-collapse'}
              label={compact ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
              caption={compact ? t('shell.expandShort') : undefined}
              compact={compact}
              active={false}
              onClick={toggleMode}
            />
          </div>
        </div>

        {renderDockedPanel()}
      </nav>

      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={closeDrawer}
        size={SIDEBAR_DRAWER_WIDTH}
        title={t('shell.menu')}
        closable={{
          closeIcon: <X aria-hidden size={18} strokeWidth={2} />,
          'aria-label': t('shell.closeMenu'),
        }}
        rootClassName="sb-drawer lg:hidden"
        destroyOnHidden
        afterOpenChange={(open) => {
          if (open && drawerFocusPending.current) {
            drawerFocusPending.current = false;
            document.getElementById(searchInputId('drawer'))?.focus();
          }
        }}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      >
        <nav
          aria-label={t('shell.mainNavigation')}
          className="sb-theme flex h-full min-h-0 flex-col"
        >
          {renderExpandedTree('drawer', closeDrawer)}
        </nav>
      </Drawer>
    </>
  );
}

function RailSkeleton({
  compact,
  label,
}: {
  compact: boolean;
  label: string;
}): React.ReactNode {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 px-1 py-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className={`sb-skeleton ${compact ? 'mx-auto h-12 w-14' : 'h-9 w-full'}`}
        />
      ))}
    </div>
  );
}
