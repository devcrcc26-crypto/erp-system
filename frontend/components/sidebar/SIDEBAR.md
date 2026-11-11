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
| `SidebarShell.tsx` | Outer shell: icon rail, pinned (docked) vs unpinned (flyout) panel, route sync, Cmd/Ctrl+K, mobile drawer. |
| `sidebar-flyout.ts` | Hover-intent controller for the unpinned flyout, plus the pinned panel rules. Unit-tested. |
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

- **Look (v2, `.erp-sidebar-v2`):** light theme, docked flush to the left edge. Colours come
  from the `--sb-*` variables in `sidebar.css`.
- **Desktop = icon rail (72px) + module panel.** The caption stays in each item's accessible
  name but is visually hidden; the full label is in a tooltip on hover *and* keyboard focus.
  Badges sit as a small count on the icon. A folder's panel (272px) has a heading and a
  close button. The labelled tree is only used in the mobile drawer.
- **Unpinned (default): the panel is a flyout overlay.** It is absolutely positioned beside
  the rail (`.sb-flyout`), so the page never reflows. Hover intent lives in
  `sidebar-flyout.ts` (unit-tested): open after 150ms of hover; close 300ms after the pointer
  leaves both the rail item and the panel; hovering another rail item while open switches the
  content after 100ms with no close/reopen. A click (or Enter/Space) toggles it and makes it
  stay open until a second click, Escape, a click outside, or navigation — this is the touch
  path, since touch pointers never trigger hover. Opening by click/keyboard moves focus into
  the panel; Escape returns focus to the rail item. Following a panel link closes it.
- **Pinned: the panel is docked** beside the rail, follows the current page's module and
  pushes the content right (the previous fixed layout). Pinning keeps whatever the flyout was
  showing.
- The **Pin sidebar** toggle (`aria-pressed`) sits at the bottom of the rail. The choice is
  saved per user in `localStorage` under `erp.sidebar.pinned:<userId>` (`"1"` / `"0"`); there
  is no backend store for UI preferences.
- While a folder's panel is open its rail tooltip is suppressed, so it never covers panel
  items. The current module's rail icon keeps its highlight in both modes, even while its
  panel is open.
- Panel open/close is a 160ms fade/slide, disabled under `prefers-reduced-motion`.
- **New Request** (right under Dashboard) is a direct link to the request picker
  (`/approvals/new`). It stays highlighted on every `/approvals/new/*` form. Submitted
  requests are tracked under **Approvals**, the next rail item.
- **My Profile** sits in the footer with no permission requirement, so every signed-in user
  can reach `/profile`.
- **User Guide** is the last rail folder, for every signed-in user. Its panel lists one link
  per guide topic (`/help/<slug>`), grouped Basics, Time & Attendance, Pay & Travel,
  Operations and People. `guideTopic()` in the config builds each link from
  `lib/help/modules.ts`: a topic whose roles do not include `EMPLOYEE` requires `hr.view`.
  Guide pages render in the normal content area and follow the header Language control.
- **Footer (drawer):** utility links render as a row of icon buttons
  (`SidebarFooter.tsx`) with hover/focus tooltips and floating badges. The link flagged
  `accountCard: true` in the config (My Profile) renders as an account card below them,
  with the user's initials, name and email. Links with `openInNewTab: true` render as
  `<a target="_blank">`. In compact mode the same links stack vertically as icon buttons,
  the account becomes an initials avatar, and every item has a right-side hover/focus tooltip.
- **Limited navigation:** users without `hr.view` see only Dashboard, New Request, Approvals,
  Evaluation Inbox (leads), Announcements, My Profile and User Guide. Supervisors (anyone with
  direct reports, `team.view`) also get the team lists: My Team, Employee Contracts, Leave
  Requests, Overtime, Attendance, Field Movement Logs, Work From Home, Site Assignments,
  Evaluations, Expense Claims, Per Diem, Flight Applications, Business Trips, Vehicle Applications
  and Exit Permits, scoped by the backend to their reporting chain. Users with `hr.view` get the full sidebar (see "How permissions control visibility").
- **Project pages** (`/projects/:id/...`) show the project's workspace navigation inside the
  Project Management folder, above the portfolio groups (which start collapsed). There is no
  separate project column. Widest case (pinned): 72px rail + 272px docked panel = 344px.
- **Mobile (< 1024px):** the expanded tree in a left drawer with a visible header and close button.

## Structure — what goes where

The rail is read top to bottom as *daily work → modules → account/system*. Keep it that way.

| Rail position | Entries | Rule |
| --- | --- | --- |
| Top | Dashboard, New Request | Where every user starts. |
| Inboxes | Approvals (badge), Evaluation Inbox (non-HR leads only; HR users have it under People › Performance), Announcements (everyone; unread badge; also covers What's new) | Things waiting on *me*. Direct links, never folders. |
| People | Employees, Contracts · Performance (inbox, evaluations, cycles, templates) · Company Structure (departments, positions, disciplines) · Reports | Who works here and how they're doing. |
| Time & Attendance | Leave (requests, policy, public holidays) · Attendance (attendance, field movement, work from home, site assignments) · Schedules & Overtime | When people work. |
| Pay & Travel | Payroll, Expense Claims · Travel (flights, business trips, per diem, per-diem rates) | Money paid to people. |
| Operations | Procurement · Fleet & Assets (vehicle requests, refueling, inspection & repair, company vehicles, company assets) · Administration (seals, exit permits, Manage announcements for `announcements.manage`) | Company resources — not HR. |
| Projects | Project Management (System Administrator only; hosts project nav) | |
| User Guide | One link per guide topic, grouped like the modules | Help for every module; topics follow `lib/help/modules.ts`. |
| Footer | My Profile (account card), Audit Log, Settings | Account and system only. |

Keep each rail panel to **12 links or fewer** (a test enforces this). If a domain outgrows
that, split it into a new folder rather than adding another group to an existing one.
Two folders are exempt: **Project Management**, which hosts per-project navigation, and the
**User Guide**, a table of contents with one link per guide topic in collapsible groups.

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
2. Register a **new** Lucide icon key in `NAV_ICON_COMPONENTS` for the destination. Every
   sidebar link and folder has its own glyph; two entries may share one only when they open
   the same page (a test in `sidebar-model.test.ts` enforces this). The registry is
   Lucide-only so stroke weight stays consistent.
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
   `unlessGranted` (`hr.view`) keeps only the entries listed in `entryIds`
   (`dashboard`, `new-request`, `approvals`, `evaluation-inbox`, `announcements`, `my-profile`,
   `user-guide`), whatever else it could open. `extraEntryIds` adds ids for sessions holding a
   token: `team.view` adds `my-team`, `employee-contract`, `leave-requests`, `overtime`,
   `attendance`, `field-movement-logs`, `work-from-home`, `site-assignments`, `evaluations`,
   `expense-claims`, `per-diem`, `flight-applications`, `business-trips`,
   `vehicle-applications` and `exit-permit`. An id can name a top-level entry (an
   allowlisted folder keeps all its links) or a link inside a folder: the folder is then kept with
   only its allowlisted links (Pay & Travel → Expense Claims, Per Diem). Change the lists in
   the config; do not special-case them in components. `buildSidebarModel` applies it, so the
   desktop sidebar, compact rail and mobile drawer all follow it.

Current mapping (edit `sidebar-permissions.ts` only):

| Token | Granted when |
| --- | --- |
| `hr.view` | `canViewHr` |
| `team.view` | `canViewHr` or `hasDirectReports` (supervisor team lists) |
| `team.members` | `hasDirectReports` without `canManageUsers` (My Team; HR has Users) |
| `leave.access` / `overtime.access` | `canViewHr` or the module's view/create flag |
| `flight.access` / `businessTrip.access` | `canViewHr` (the `/hr` list pages are HR-only; employees submit via `/approvals/new`) |
| `expenseClaims.access` / `perDiem.access` | `team.view` or `isSystemAdministrator` (other employees use New Request and Approvals) |
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

- a soft pill tinted with the primary colour at 10% (`--sb-active-bg`),
- primary-coloured text and icon (`--sb-active-text`, the primary-hover shade #0F6E56,
  5.3:1 on the tint), medium weight (500).

The base rules earlier in `sidebar.css` (left accent bar) are overridden by the
`.erp-sidebar-v2` block at the end of the file; v2 has no accent bar. Every destination icon
sits in a soft **icon chip** (`--sb-chip-*`): 30px on rail rows, 28px on panel items, 38px
on compact tiles. The chip is part of the one selected state - it deepens to the primary
tint with a primary icon, so the current page reads from the icon alone in the compact
rail. Docked panels show the folder's own icon beside the heading (`.sb-panel-icon`).

It applies to any `.sb-selectable` element with `aria-current="page"` (links) or
`data-active="true"` (the rail folder containing the current page). Rail rows,
compact tiles, panel items and project items all use it. The rail folder stays
highlighted while its panel is open, so the current module is always visible on the
rail; the page's own item inside the panel is highlighted too.

The active link is the visible link whose `href` (or an `activePaths` entry) is the
longest prefix of the current route. `/` matches only the dashboard. Do not add
per-component active logic; add `activePaths` in the config instead.

The sidebar uses a light surface that matches the app tokens. To re-theme it, redefine
the `--sb-*` variables on `.sb-theme, .sb-drawer` (the mobile drawer renders outside
`.sb-theme`). The rules themselves do not change.

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
  group titles use `erp-sidebar-group-title` (12px / 600 / 0.06em, muted, uppercase in
  v2 by product decision, 2026-10-01; Chinese labels are unaffected)
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
- **Keyboard:** everything reachable by Tab. Enter/Space on a rail folder opens its panel
  and moves focus into it; Esc closes the panel (docked or flyout) and returns focus to its
  folder. A closed flyout is `inert`, so it is never in the tab order. In search, ↓/↑ move through results and Enter opens the first match.

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
