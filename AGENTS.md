# Agent conventions

Project-wide rules live in `.cursorrules`. This file records conventions that override or
extend it for specific areas. Read the linked docs before changing those areas.

## Responsive layout (all pages)

Rulebook: [`docs/RESPONSIVE_RULEBOOK.md`](docs/RESPONSIVE_RULEBOOK.md). Read it before fixing overflow
or small-screen issues: breakpoint scales, form layout, table patterns, standard `Col` spans,
overflow fixes, and shell rules.

## Sidebar navigation (`frontend/components/sidebar/`)

Full guide: [`frontend/components/sidebar/SIDEBAR.md`](frontend/components/sidebar/SIDEBAR.md).

- **Config, not JSX.** Every sidebar destination is an entry in
  `frontend/components/sidebar/sidebar.config.ts`. To add, move or remove a module, edit that
  file (plus the en and zh locale strings). Do not add links in components, and do not
  reintroduce `IconRail`, `MainNavPanel`, `ContextSidebar` or other parallel navigation.
- **Permissions in one place.** A link declares `requires: [...tokens]` (any-of). Tokens are
  derived from session capabilities only in `sidebar-permissions.ts`. Items the user cannot
  access are removed, never greyed out. Hidden UI is not security; pages and APIs still check.
- **Limited navigation.** Users without `hr.view` see only Dashboard, New Request,
  Approvals, Evaluation Inbox (leads), Announcements, My Profile and User Guide. Supervisors
  (anyone with direct reports, token `team.view`) also see My Team, Employee Contracts (read-only),
  Leave Requests, Overtime, Attendance, Field Movement Logs, Work From Home (read-only), Site
  Assignments, Evaluations, Expense Claims, Per Diem, Flight Applications, Business Trips, Vehicle
  Applications and Exit Permits for their team. This is
  `limitedNavigation` (with `extraEntryIds`) in `sidebar.config.ts`, applied in `buildSidebarModel`;
  edit the allowlists there, never in components.
- **One selected state.** `aria-current="page"` (or `data-active="true"` on a closed folder)
  on a `.sb-selectable` element, styled once in `sidebar.css`. Do not add a second highlight
  style anywhere in the sidebar.
- **Folders vs links.** Anything that opens a panel is a `SidebarRailItem kind="folder"`
  (chevron, `aria-expanded`, `aria-haspopup`, `aria-controls`). Anything that navigates is a link.
- **Project navigation** is defined in `frontend/lib/navigation/project-workspace-nav.ts` and
  rendered inside the Project Management folder. Never add a separate project column. On
  project pages the sidebar must stay ≤ 400px wide.
- **Accessibility is required, not optional:** a visible focus ring (never `outline: none`
  without a replacement), text ≥ 12px at ≥ 4.5:1 contrast, one `<nav>` landmark, the skip link
  stays the first focusable element in `AppShell`, badge counts announced as sentences,
  tooltips on hover *and* focus, and a visible close control on the mobile drawer.
- **Colours** come from the `--sb-*` variables in `sidebar.css`. Do not hard-code colours in
  sidebar components.
- **Tests:** update `sidebar-model.test.ts` when you change permissions, filtering, active-link
  resolution or search. Run `npx vitest run components/sidebar` from `frontend/`.
