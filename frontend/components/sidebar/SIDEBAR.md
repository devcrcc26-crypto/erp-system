# Sidebar

The application sidebar is the only persistent navigation surface in CCECC PWF. If a
destination is not in the sidebar, users cannot find it. Everything it shows comes from
one data file, filtered by the signed-in user's permissions.

## Files

| File | Responsibility |
| --- | --- |
| `sidebar.config.ts` | **The data.** Every link, group, folder, icon, path and required permission. Also widths and storage keys. |
| `sidebar-permissions.ts` | Maps session capabilities (`/auth/capabilities`) onto sidebar permission tokens. The only place backend flags meet navigation. |
| `sidebar-model.ts` | Pure helpers: permission filtering, active-link resolution, module search, project-context groups. Unit-tested. |
| `use-sidebar-data.ts` | Client hooks: permissions, badge counts, project workspace items, persisted preferences (mode, collapsed groups, favorites). |
| `SidebarShell.tsx` | Outer shell: expanded/compact state, route sync, Cmd/Ctrl+K, docked panels, mobile drawer. |
| `SidebarRailItem.tsx` | A top-level entry: link, folder, or action. Folder vs link distinction and ARIA live here. |
| `SidebarModulePanel.tsx` | A folder's contents, inline (expanded) or docked beside the rail (compact). |
| `SidebarModuleGroup.tsx` | A collapsible group inside a panel (People, Time & Leave, …). |
| `SidebarModuleItem.tsx` | A single destination inside a group, with optional favorite toggle. |
| `SidebarSearch.tsx` | "Find a module" field and its keyboard-navigable result list. |
| `SidebarBadge.tsx` | Counter pill announced to screen readers. |
| `sidebar.css` | Theme variables, the selected state, the focus ring. |

The shell is mounted by `components/ui/shell/AppShell.tsx`, which the dashboard route
layout (`app/(dashboard)/layout.tsx`) renders for every authenticated page.

## How it behaves

- **Expanded (default, 272px):** icon + label rows, always on one line. Folders expand in place, one at a time.
- **Compact (opt-in, 84px):** icon over a caption; the full label is in a tooltip on hover
  *and* keyboard focus. Folders open a docked 272px panel with a heading and a close button.
- The **Collapse sidebar / Expand sidebar** button at the bottom always changes the layout,
  whatever page you are on. The choice is saved in `localStorage` (`sidebar:mode`).
- A folder panel closes when you click its folder again, press its close button, press Esc
  (docked), or navigate to a page outside it. Navigating into a folder's page opens it in
  expanded mode.
- **New Request** (right under Dashboard) is a direct link to the request picker
  (`/approvals/new`). It stays highlighted on every `/approvals/new/*` form. Submitted
  requests are tracked under **Approvals**.
- **My Profile** sits in the utility section (after Approvals) with no permission requirement,
  so every signed-in user can reach `/profile`.
- **Limited navigation:** users without `hr.view` see only Dashboard, New Request, Approvals
  and My Profile. Users with `hr.view` get the full sidebar (see "How permissions control visibility").
- **Project pages** (`/projects/:id/...`) show the project's workspace navigation inside the
  Project Management folder, above the portfolio groups (which start collapsed). There is no
  separate project column. Widest case: compact rail + docked panel = 356px.
- **Mobile (< 1024px):** the expanded tree in a left drawer with a visible header and close button.

## Add a new module

Add one `link` entry to the right group in `SIDEBAR_CONFIG` (`sidebar.config.ts`):

```ts
{
  kind: 'link',
  id: 'safety-inspections',                  // stable, unique — used for favorites
  labelKey: 'nav.hr.safetyInspections',      // add to locales/en/epc.json and locales/zh/epc.json
  icon: 'hr-inspection',                     // key in lib/navigation/nav-icons.tsx
  href: '/hr/safety-inspections',
  requires: ['administration.access'],       // ANY of these; omit = every signed-in user
  keywords: ['hse', 'site check'],           // optional search synonyms
  activePaths: ['/hr/safety-history'],       // optional extra routes that highlight this link
}
```

That is all. No component changes. Checklist:

1. Add the label to **both** `locales/en/epc.json` and `locales/zh/epc.json`.
2. Use an existing icon key, or register a new one in `NAV_ICON_COMPONENTS`.
3. Pick the narrowest permission token that matches the page's own access check (see below).
4. If the page is not built yet, use `href: null, comingSoon: true`. It renders as
   non-interactive text with a "Coming soon" pill.
5. Add the route's title and breadcrumb to `config/navConfig.ts` (page header, not sidebar).

## Temporarily hide an entry

Set `hidden: true` on a link or folder. It is removed for every user (sidebar, compact
rail, mobile drawer and search) but stays in the config, so restoring it is a one-line
change. **Project Management is visible to System Administrator only** (`pm.*` tokens
are gated on `isSystemAdministrator` in `sidebar-permissions.ts`). That folder also
hosts the project workspace nav on `/projects/:id` pages.

## Add a new group

Add an object to a folder's `groups` array:

```ts
{
  id: 'hr-safety',                       // unique across the whole config
  labelKey: 'nav.sections.safety',       // short, Title Case, both locales
  items: [ /* links */ ],
}
```

Groups are collapsible and remember their state per user. A group whose links are all
hidden for the current user is removed. So is a folder whose groups are all empty.

## Add a new folder (domain)

Add a `kind: 'folder'` entry to `SIDEBAR_CONFIG.primary` with an `id`, `labelKey`, `icon`
and `groups`. If the label will not fit on one line in the compact rail (roughly 10
characters), add a `shortLabelKey` (e.g. "HR"). Compact tiles always show a single-line
caption; the full label stays in the tooltip and the accessible name. The same option
works on top-level links (e.g. Audit Log → "Audit"). Keep the number of folders small. Each one is a top-level decision every user
has to read past.

## How permissions control visibility

1. The backend returns capability flags (`useAuthStore().capabilities`).
2. `resolveSidebarPermissions()` turns them into a set of `SidebarPermission` tokens.
3. `buildSidebarModel()` keeps a link if it has no `requires`, or the user holds **any**
   listed token.
4. Anything the user cannot access is **removed**, never greyed out. Empty groups and
   folders disappear too.
5. **Limited navigation** (`SIDEBAR_CONFIG.limitedNavigation`): a session without
   `unlessGranted` (`hr.view`) keeps only the top-level entries listed in `entryIds`
   (`dashboard`, `new-request`, `approvals`, `my-profile`), whatever else it could open. Change the list in
   the config; do not special-case it in components. `buildSidebarModel` applies it, so the
   desktop sidebar, compact rail and mobile drawer all follow it.

Current mapping (edit `sidebar-permissions.ts` only):

| Token | Granted when |
| --- | --- |
| `hr.view` | `canViewHr` |
| `leave.access` / `overtime.access` | `canViewHr` or the module's view/create flag |
| `flight.access` / `businessTrip.access` | `canViewHr` (the `/hr` list pages are HR-only; employees submit via `/approvals/new`) |
| `expenseClaims.access` | `canViewHr`, flight access, or business-trip access |
| `perDiemRates.manage` | `canViewHr` or `canManageUsers` |
| `procurement.access`, `fleet.access`, `administration.access` | `canViewHr` (no dedicated backend flag yet; `/hr` routes also require it) |
| `users.manage` | `canManageUsers` |
| `settings.manage` | `canManageRoles` or `canEditRoles` |
| `audit.view` | `canViewAuditLogs` |
| `org.*` | Same rules the Organization pages enforce |
| `pm.*` | System Administrator **and** PM module flags + EPC design-cycle persona rules (`canViewGlobalNavKey`) |

When the backend adds a finer flag (say `procurement.view` for storekeepers), change the one
matching line in the resolver. Adding a **new** token means extending the `SidebarPermission`
union in `sidebar.config.ts` and granting it in the resolver.

Hiding a link is not security. Every page and API must still enforce its own permission.

## The selected state

There is exactly one "you are here" treatment, defined once in `sidebar.css`:

- lighter background (`--sb-active-bg`), white text, semibold,
- a 3px accent bar (`--sb-accent`) on the left edge.

It applies to any `.sb-selectable` element with `aria-current="page"` (links) or
`data-active="true"` (a **closed** folder containing the current page). Rail rows,
compact tiles, panel items and project items all use it. When a folder is open, the
highlight moves to the item inside it, so only one element is ever highlighted.

The active link is the visible link whose `href` (or an `activePaths` entry) is the
longest prefix of the current route. `/` matches only the dashboard. Do not add
per-component active logic; add `activePaths` in the config instead.

To theme the sidebar for a light surface, redefine the `--sb-*` variables on `.sb-theme`.
The rules themselves do not change.

## Accessibility requirements (every item must meet these)

- **Focus ring:** never set `outline: none`. Sidebar controls inherit the shared ring
  (2px `--sb-focus`, 2px offset). New interactive elements must be `<a>`, `<button>` or
  `<input>` inside `.sb-theme`, or declare the same `:focus-visible` rule.
- **Folders:** rendered by `SidebarRailItem kind="folder"` with `aria-expanded`,
  `aria-haspopup="true"` and `aria-controls`, plus a chevron. Never make a folder look like a link.
- **One landmark:** all destinations, including Approvals, Audit Log and Settings, sit inside
  the single `<nav aria-label="Main navigation">`. Do not add another `<nav>` or `<aside>` label.
- **Skip link:** `AppShell` renders "Skip to main content" as the first focusable element,
  targeting `<main id="main-content">`. Keep it first.
- **Text size and contrast:** nothing under 12px. Inside a panel there are two levels:
  group titles use `erp-sidebar-group-title` (12px / 600 / 0.04em, muted, never all-caps)
  and module links use `erp-sidebar-module-link` (13px / 400, 500 when active). Hierarchy
  comes from weight, tracking and colour, not a size drop. Group titles are 7:1 on the
  sidebar background. Keep new colours at ≥ 4.5:1
  for text and ≥ 3:1 for UI parts.
- **Badges:** use `SidebarBadge` with a full sentence (`t('shell.badgePendingApprovals',
  { count })`). The number is `aria-hidden`; the sentence is visually hidden text.
- **Tooltips:** compact-mode tooltips use `trigger={['hover', 'focus']}`.
- **Search:** has a real `<label>`, a visible focus ring, `aria-keyshortcuts`, and a polite live
  region announcing the result count.
- **Mobile drawer:** keep the Ant Design header and close button visible.
- **Keyboard:** everything reachable by Tab. Esc closes a docked panel and returns focus to its
  folder. In search, ↓/↑ move through results and Enter opens the first match.

## Search and favorites

- **Cmd/Ctrl + K** focuses "Find a module" (opens the docked search panel in compact mode, the
  drawer on mobile). Every term must match the translated label, folder, group or `keywords`.
- Users can pin up to **5** links with the star button. Pins are stored per user in
  `localStorage` (`sidebar:favorites:<userId>`) and appear as a Favorites group at the top
  (a Favorites entry in compact mode). Pins the user can no longer access are not shown.
  Project-specific links cannot be pinned.

## Tests

`sidebar-model.test.ts` covers role-based filtering (HR officer, engineer, empty session),
project context, active-link resolution and search. Add a case whenever you add a
permission token or change the resolver.

```bash
npx vitest run components/sidebar
```
