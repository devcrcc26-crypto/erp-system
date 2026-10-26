'use client';

import './sidebar.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Drawer } from 'antd';
import { X } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo/BrandLogo';
import SidebarFooter from '@/components/sidebar/SidebarFooter';
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
  SIDEBAR_MAX_FAVORITES,
  type SidebarBadgeSource,
} from '@/components/sidebar/sidebar.config';
import { nextOpenPanel, panelWhenPinning } from '@/components/sidebar/sidebar-flyout';
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
  useSidebarFlyout,
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
const TRANSIENT_PANELS = [SEARCH_PANEL, FAVORITES_PANEL] as const;
const FAVORITES_GROUP_ID = 'favorites';

const BADGE_LABEL_KEYS: Record<SidebarBadgeSource, string> = {
  pendingApprovals: 'shell.badgePendingApprovals',
  pendingEvaluationActions: 'shell.badgePendingEvaluations',
  unreadAnnouncements: 'announcements.nav.badgeUnread',
};

type Surface = 'desktop' | 'drawer';

/** DOM ids - focus is moved by id so no refs are read during render. */
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

/**
 * The application sidebar: one `<nav>` holding every destination.
 *
 * Desktop (lg+): an icon rail. A module's panel is either
 * - unpinned (default): a flyout OVERLAY beside the rail, opened by hover
 *   intent or click (`sidebar-flyout.ts`), closed by leaving it, Escape, an
 *   outside click or navigating - the page never reflows; or
 * - pinned: docked beside the rail, following the current module and pushing
 *   the content right (the previous fixed layout).
 * The footer toggle switches between the two; the choice is stored per user.
 * Below lg: the labelled tree in a drawer with a visible close button.
 * Everything rendered comes from `sidebar.config.ts` filtered by permissions.
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

  const pinned = prefs.pinned;
  // Docked panel (pinned desktop) and the drawer's open folder.
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  // Unpinned desktop flyout (hover intent / click).
  const flyout = useSidebarFlyout();
  const flyoutController = flyout.controller;
  const flyoutOpenId = pinned ? null : flyout.state.openId;
  const desktopPanel = pinned ? openPanel : flyoutOpenId;
  // Keep the last flyout content mounted while it animates closed.
  const [lastFlyoutId, setLastFlyoutId] = useState<string | null>(null);
  if (flyoutOpenId !== null && flyoutOpenId !== lastFlyoutId) {
    setLastFlyoutId(flyoutOpenId);
  }
  const navRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSidebar(links, query, t), [links, query, t]);

  const favoriteLinks = useMemo(
    () =>
      prefs.favoriteIds
        .map((id) => links.find((entry) => entry.link.id === id)?.link)
        .filter((link): link is SidebarLink => link !== undefined),
    [prefs.favoriteIds, links],
  );

  // ── Route sync (adjusted during render, not in an effect) ──
  const [synced, setSynced] = useState<{
    pathname: string | null;
    folderId: string | null | undefined;
  }>({ pathname: null, folderId: undefined });

  if (synced.pathname !== pathname || synced.folderId !== activeFolderId) {
    const navigated = synced.pathname !== null && synced.pathname !== pathname;
    setSynced({ pathname, folderId: activeFolderId });
    if (navigated && query !== '') {
      setQuery('');
    }
    setOpenPanel(
      nextOpenPanel({
        current: openPanel,
        navigated,
        folderChanged: synced.folderId !== activeFolderId,
        activeFolderId,
        transientIds: TRANSIENT_PANELS,
      }),
    );
  }

  // Any navigation closes the flyout (links also close it on click).
  useEffect(() => {
    flyoutController.close();
  }, [pathname, flyoutController]);

  // While the flyout is open: Escape closes it (focus returns to its rail
  // item when focus was in the sidebar); a pointer press outside closes it.
  const flyoutIsOpen = flyoutOpenId !== null;
  const onFlyoutKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || flyoutOpenId === null) {
      return;
    }
    const id = flyoutOpenId;
    const focusInSidebar = navRef.current?.contains(document.activeElement) ?? false;
    flyoutController.close();
    if (focusInSidebar) {
      focusSoon(folderButtonId(id));
    }
  });
  const onPointerDownOutside = useEffectEvent((event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && navRef.current?.contains(target)) {
      return;
    }
    flyoutController.close();
  });
  useEffect(() => {
    if (!flyoutIsOpen) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      onFlyoutKeyDown(event);
    }
    function handlePointerDown(event: PointerEvent): void {
      onPointerDownOutside(event);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [flyoutIsOpen]);

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
    if (pinned) {
      setOpenPanel(SEARCH_PANEL);
    } else {
      flyoutController.open(SEARCH_PANEL);
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

  // ── Panel + pin actions ──
  function focusIntoPanel(id: string): void {
    focusSoon(
      id === SEARCH_PANEL ? searchInputId('desktop') : `${panelId('desktop', id)}-heading`,
    );
  }

  /** Click / Enter / Space on a folder. Opening moves focus into the panel. */
  function toggleFolder(id: string, surface: Surface): void {
    if (surface === 'desktop' && !pinned) {
      if (flyoutController.toggle(id)) {
        focusIntoPanel(id);
      }
      return;
    }
    const opening = openPanel !== id;
    setOpenPanel(opening ? id : null);
    if (opening && surface === 'desktop') {
      focusIntoPanel(id);
    }
  }

  /** Panel close button / Escape: close and return focus to the rail item. */
  function closeDesktopPanel(id: string): void {
    if (pinned) {
      setOpenPanel(null);
    } else {
      flyoutController.close();
    }
    focusSoon(folderButtonId(id));
  }

  function closeFlyout(): void {
    flyoutController.close();
  }

  function togglePin(): void {
    if (pinned) {
      prefs.setPinned(false);
      return;
    }
    setOpenPanel(panelWhenPinning(flyout.state.openId, activeFolderId));
    flyoutController.close();
    prefs.setPinned(true);
  }

  /** Hover intent on rail items that own a panel (unpinned only, not touch). */
  function flyoutHover(id: string): React.HTMLAttributes<HTMLLIElement> {
    if (pinned) {
      return {};
    }
    return {
      onPointerEnter: (event) => {
        if (event.pointerType !== 'touch') {
          flyoutController.enterTrigger(id);
        }
      },
      onPointerLeave: (event) => {
        if (event.pointerType !== 'touch') {
          flyoutController.leaveTrigger();
        }
      },
    };
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
    const open = (surface === 'desktop' ? desktopPanel : openPanel) === entry.id;
    return (
      <li key={entry.id} {...(surface === 'desktop' ? flyoutHover(entry.id) : {})}>
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

  /**
   * Footer: utility links as icon buttons, the account card (avatar when
   * compact) and, on desktop, the collapse/expand toggle. Utility folders
   * (none today) keep the regular row/tile layout above it.
   */
  function renderFooter(
    surface: Surface,
    isCompact: boolean,
    onNavigate?: () => void,
  ): React.ReactNode {
    const footerLinks = model.utility.filter(
      (entry): entry is SidebarLink => entry.kind === 'link' && !entry.accountCard,
    );
    const account =
      model.utility.find(
        (entry): entry is SidebarLink => entry.kind === 'link' && entry.accountCard,
      ) ?? null;
    const folders = model.utility.filter((entry) => entry.kind === 'folder');
    return (
      <>
        {folders.length > 0 ? (
          <div className="sb-divider shrink-0 px-2 py-2">
            <ul className="sb-list">
              {folders.map((entry) => renderEntry(entry, surface, isCompact, onNavigate))}
            </ul>
          </div>
        ) : null}
        <SidebarFooter
          links={footerLinks}
          account={account}
          compact={isCompact}
          onNavigate={onNavigate}
          modeToggle={
            surface === 'desktop'
              ? {
                  icon: pinned ? 'sidebar-unpin' : 'sidebar-pin',
                  label: t('shell.pinSidebar'),
                  tooltip: pinned ? t('shell.unpinSidebar') : t('shell.pinSidebar'),
                  pressed: pinned,
                  onClick: togglePin,
                }
              : undefined
          }
          stateFor={(link) => {
            const badge = badgeFor(link);
            return {
              label: t(link.labelKey),
              active: activeLinkId === link.id,
              badgeCount: badge.count,
              badgeLabel: badge.label,
            };
          }}
        />
      </>
    );
  }

  /** The labelled tree - used by the mobile drawer (desktop uses the rail). */
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
        {renderFooter(surface, false, onNavigate)}
      </>
    );
  }

  function renderCompactRail(): React.ReactNode {
    return (
      <>
        <ul className="sb-list sb-compact-tools shrink-0 px-2 pt-2">
          <li {...flyoutHover(SEARCH_PANEL)}>
            <SidebarRailItem
              kind="folder"
              icon="search"
              label={t('shell.search')}
              compact
              active={false}
              open={desktopPanel === SEARCH_PANEL}
              controlsId={panelId('desktop', SEARCH_PANEL)}
              onToggle={() => toggleFolder(SEARCH_PANEL, 'desktop')}
              buttonId={folderButtonId(SEARCH_PANEL)}
            />
          </li>
          {favoriteLinks.length > 0 ? (
            <li {...flyoutHover(FAVORITES_PANEL)}>
              <SidebarRailItem
                kind="folder"
                icon="favorites"
                label={t('shell.favorites')}
                compact
                active={false}
                open={desktopPanel === FAVORITES_PANEL}
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
              {model.primary.map((entry) => renderEntry(entry, 'desktop', true, closeFlyout))}
            </ul>
          )}
        </div>
        {renderFooter('desktop', true, closeFlyout)}
      </>
    );
  }

  /**
   * A desktop panel (docked when pinned, inside the flyout when not).
   * `onNavigate` closes the flyout when one of its links is followed.
   */
  function renderDesktopPanel(panel: string, onNavigate?: () => void): React.ReactNode {
    const bindings = bindingsFor('desktop', onNavigate);
    const close = (): void => closeDesktopPanel(panel);

    if (panel === SEARCH_PANEL) {
      return (
        <SidebarModulePanel
          id={panelId('desktop', SEARCH_PANEL)}
          variant="docked"
          title={t('shell.searchNavigation')}
          icon="search"
          bindings={bindings}
          onClose={close}
        >
          <div className="px-1 pb-2">{renderSearchField('desktop', onNavigate, close)}</div>
          {query.trim() ? (
            renderResults('desktop', onNavigate)
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
          icon="favorites"
          bindings={bindings}
          onClose={close}
        >
          <ul className="sb-list">
            {favoriteLinks.map((link) => renderItem(link, onNavigate))}
          </ul>
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
        icon={folder.icon}
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
        ref={navRef}
        aria-label={t('shell.mainNavigation')}
        className="sb-theme erp-sidebar-v2 relative z-40 hidden h-full shrink-0 lg:flex"
        data-mode="compact"
        data-pinned={pinned ? 'true' : 'false'}
      >
        <div
          className="sb-rail flex h-full min-h-0 flex-col"
          style={{ width: SIDEBAR_COMPACT_WIDTH }}
        >
          <div
            className="flex shrink-0 items-center justify-center px-4"
            style={{
              height: SHELL_TOP_HEADER_HEIGHT,
              borderBottom: '1px solid var(--sb-border)',
            }}
          >
            <Link
              href="/"
              aria-label={t('shell.brandWorkspace')}
              onClick={closeFlyout}
              className="inline-flex items-center gap-2.5 rounded-md"
            >
              <BrandLogo size={28} />
            </Link>
          </div>

          {renderCompactRail()}
        </div>

        {pinned ? (
          openPanel !== null ? renderDesktopPanel(openPanel) : null
        ) : (
          // Overlay beside the rail: absolutely positioned, so the page never
          // reflows. Kept mounted (inert + hidden) while animating closed.
          <div
            className="sb-flyout"
            data-open={flyoutOpenId !== null ? 'true' : 'false'}
            inert={flyoutOpenId === null}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') {
                flyoutController.enterPanel();
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'touch') {
                flyoutController.leavePanel();
              }
            }}
          >
            {lastFlyoutId !== null ? renderDesktopPanel(lastFlyoutId, closeFlyout) : null}
          </div>
        )}
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
        rootClassName="sb-drawer erp-sidebar-v2 lg:hidden"
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
          className="sb-theme erp-sidebar-v2 flex h-full min-h-0 flex-col"
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
