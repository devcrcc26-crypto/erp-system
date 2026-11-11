import type {
  SidebarBadgeSource,
  SidebarConfig,
  SidebarEntryConfig,
  SidebarFolderConfig,
  SidebarLinkConfig,
  SidebarPermission,
} from '@/components/sidebar/sidebar.config';
import {
  projectNavHref,
  type ProjectWorkspaceNavGroup,
} from '@/lib/navigation/project-workspace-nav';
import { resolveNavIconKey } from '@/lib/navigation/nav-icons';

/** A link that survived permission filtering. */
export interface SidebarLink {
  readonly kind: 'link';
  readonly id: string;
  readonly labelKey: string;
  readonly shortLabelKey?: string;
  readonly icon: string;
  /** Null only for coming-soon placeholders. */
  readonly href: string | null;
  readonly comingSoon: boolean;
  readonly activePaths: readonly string[];
  readonly keywords: readonly string[];
  readonly badge?: SidebarBadgeSource;
  /** Config links can be pinned; per-project links cannot. */
  readonly pinnable: boolean;
  /** Shown as the account card in the sidebar footer. */
  readonly accountCard: boolean;
  /** Open in a new browser tab. */
  readonly openInNewTab: boolean;
}

export interface SidebarGroup {
  readonly id: string;
  readonly labelKey: string;
  readonly items: readonly SidebarLink[];
  /** Initial state before the user toggles the group. */
  readonly defaultCollapsed: boolean;
}

export interface SidebarProjectHeader {
  readonly projectId: string;
  readonly name: string;
  readonly nameZh: string | null;
}

export interface SidebarFolder {
  readonly kind: 'folder';
  readonly id: string;
  readonly labelKey: string;
  readonly shortLabelKey?: string;
  readonly icon: string;
  readonly groups: readonly SidebarGroup[];
  /** Present when this folder currently hosts a project's workspace nav. */
  readonly project: SidebarProjectHeader | null;
}

export type SidebarEntry = SidebarLink | SidebarFolder;

export interface SidebarModel {
  readonly primary: readonly SidebarEntry[];
  readonly utility: readonly SidebarEntry[];
}

/** A visible link together with where it lives in the tree. */
export interface SidebarLocatedLink {
  readonly link: SidebarLink;
  readonly folderId: string | null;
  readonly folderLabelKey: string | null;
  readonly groupId: string | null;
  readonly groupLabelKey: string | null;
}

export interface SidebarProjectContext {
  readonly header: SidebarProjectHeader;
  /** Already visibility-filtered project workspace groups. */
  readonly groups: readonly SidebarGroup[];
}

/** Visible when no permission is required, or ANY listed permission is held. */
export function isLinkVisible(
  link: SidebarLinkConfig,
  permissions: ReadonlySet<SidebarPermission>,
): boolean {
  if (link.hidden) {
    return false;
  }
  if (!link.requires || link.requires.length === 0) {
    return true;
  }
  return link.requires.some((permission) => permissions.has(permission));
}

function toLink(config: SidebarLinkConfig): SidebarLink {
  return {
    kind: 'link',
    id: config.id,
    labelKey: config.labelKey,
    shortLabelKey: config.shortLabelKey,
    icon: config.icon,
    href: config.href,
    comingSoon: config.comingSoon === true,
    activePaths: config.activePaths ?? [],
    keywords: config.keywords ?? [],
    badge: config.badge,
    pinnable: config.comingSoon !== true,
    accountCard: config.accountCard === true,
    openInNewTab: config.openInNewTab === true,
  };
}

function filterFolder(
  folder: SidebarFolderConfig,
  permissions: ReadonlySet<SidebarPermission>,
  projectContext: SidebarProjectContext | null,
): SidebarFolder | null {
  const hostsProject = Boolean(folder.hostsProjectContext && projectContext);

  const ownGroups: SidebarGroup[] = folder.groups
    .map((group) => ({
      id: group.id,
      labelKey: group.labelKey,
      items: group.items
        .filter((item) => isLinkVisible(item, permissions))
        .map(toLink),
      // Inside a project, portfolio-wide groups step back.
      defaultCollapsed: hostsProject,
    }))
    .filter((group) => group.items.length > 0);

  const groups =
    hostsProject && projectContext
      ? [...projectContext.groups, ...ownGroups]
      : ownGroups;

  if (groups.length === 0) {
    return null;
  }

  return {
    kind: 'folder',
    id: folder.id,
    labelKey: folder.labelKey,
    shortLabelKey: folder.shortLabelKey,
    icon: folder.icon,
    groups,
    project: hostsProject && projectContext ? projectContext.header : null,
  };
}

function filterEntries(
  entries: readonly SidebarEntryConfig[],
  permissions: ReadonlySet<SidebarPermission>,
  projectContext: SidebarProjectContext | null,
): SidebarEntry[] {
  const visible: SidebarEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'link') {
      if (isLinkVisible(entry, permissions)) {
        visible.push(toLink(entry));
      }
      continue;
    }
    if (entry.hidden) {
      continue;
    }
    const folder = filterFolder(entry, permissions, projectContext);
    if (folder) {
      visible.push(folder);
    }
  }
  return visible;
}

/**
 * Removes everything the session cannot open. Empty groups and folders
 * disappear entirely - nothing is ever rendered greyed out.
 */
export function buildSidebarModel(
  config: SidebarConfig,
  permissions: ReadonlySet<SidebarPermission>,
  projectContext: SidebarProjectContext | null = null,
): SidebarModel {
  const primary = filterEntries(config.primary, permissions, projectContext);
  const utility = filterEntries(config.utility, permissions, projectContext);

  // Limited navigation: without the gating permission, only the allowlisted
  // entries remain (e.g. Dashboard, New Request, Approvals).
  const limited = config.limitedNavigation;
  if (limited && !permissions.has(limited.unlessGranted)) {
    const allowed = new Set(limited.entryIds);
    for (const extra of limited.extraEntryIds ?? []) {
      if (permissions.has(extra.whenGranted)) {
        extra.entryIds.forEach((id) => allowed.add(id));
      }
    }
    return {
      primary: limitEntries(primary, allowed),
      utility: limitEntries(utility, allowed),
    };
  }

  return { primary, utility };
}

/**
 * Keeps allowlisted entries. An allowlisted folder keeps all its links; any
 * other folder keeps only its allowlisted links (e.g. Pay & Travel → Expense
 * Claims) and disappears when none are left.
 */
function limitEntries(
  entries: readonly SidebarEntry[],
  allowed: ReadonlySet<string>,
): SidebarEntry[] {
  const kept: SidebarEntry[] = [];
  for (const entry of entries) {
    if (allowed.has(entry.id)) {
      kept.push(entry);
      continue;
    }
    if (entry.kind !== 'folder') {
      continue;
    }
    const groups = entry.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.id)),
      }))
      .filter((group) => group.items.length > 0);
    if (groups.length > 0) {
      kept.push({ ...entry, groups });
    }
  }
  return kept;
}

/** Converts visibility-filtered project workspace groups into sidebar groups. */
export function buildProjectContextGroups(
  projectId: string,
  groups: readonly ProjectWorkspaceNavGroup[],
): SidebarGroup[] {
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      id: `project-${group.key}`,
      labelKey: group.labelKey,
      defaultCollapsed: false,
      items: group.items.map(
        (item): SidebarLink => ({
          kind: 'link',
          id: `project:${item.key}`,
          labelKey: item.labelKey,
          icon: resolveNavIconKey(item.key, item.iconKey),
          href: projectNavHref(projectId, item.pathSuffix),
          comingSoon: false,
          activePaths: [],
          keywords: [],
          pinnable: false,
          accountCard: false,
          openInNewTab: false,
        }),
      ),
    }));
}

/** Every visible link in tree order, with its folder and group. */
export function flattenSidebarModel(model: SidebarModel): SidebarLocatedLink[] {
  const located: SidebarLocatedLink[] = [];
  for (const entry of [...model.primary, ...model.utility]) {
    if (entry.kind === 'link') {
      located.push({
        link: entry,
        folderId: null,
        folderLabelKey: null,
        groupId: null,
        groupLabelKey: null,
      });
      continue;
    }
    for (const group of entry.groups) {
      for (const link of group.items) {
        located.push({
          link,
          folderId: entry.id,
          folderLabelKey: entry.labelKey,
          groupId: group.id,
          groupLabelKey: group.labelKey,
        });
      }
    }
  }
  return located;
}

function matchLength(pathname: string, prefix: string): number {
  if (prefix === '/') {
    return pathname === '/' ? 1 : -1;
  }
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    return prefix.length;
  }
  return -1;
}

/**
 * The most specific visible link for the route (longest matching prefix),
 * or null when the route is not in the sidebar (e.g. /profile).
 */
export function resolveActiveLink(
  pathname: string,
  links: readonly SidebarLocatedLink[],
): SidebarLocatedLink | null {
  let best: SidebarLocatedLink | null = null;
  let bestLength = -1;
  for (const entry of links) {
    const { href, activePaths } = entry.link;
    for (const prefix of href ? [href, ...activePaths] : activePaths) {
      const length = matchLength(pathname, prefix);
      if (length > bestLength) {
        best = entry;
        bestLength = length;
      }
    }
  }
  return best;
}

/**
 * "Find a module": every whitespace-separated term must appear in the
 * translated label, its folder/group label, or its keywords.
 */
export function searchSidebar(
  links: readonly SidebarLocatedLink[],
  query: string,
  translate: (key: string) => string,
): SidebarLocatedLink[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  return links.filter(({ link, folderLabelKey, groupLabelKey }) => {
    if (link.href === null) {
      return false;
    }
    const haystack = [
      translate(link.labelKey),
      folderLabelKey ? translate(folderLabelKey) : '',
      groupLabelKey ? translate(groupLabelKey) : '',
      ...link.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
