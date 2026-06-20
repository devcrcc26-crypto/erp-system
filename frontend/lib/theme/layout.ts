/**
 * Shared layout spacing for page sections and card surfaces.
 */
export const layout = {
  pageStack: 'flex flex-col gap-6 sm:gap-8 md:gap-10',
  sectionStack: 'flex flex-col gap-6 sm:gap-8',
  cardGrid: 'grid gap-6 sm:gap-8',
  cardSurface:
    'rounded-lg border border-slate-200 bg-white shadow-sm',
  cardPadding: 'p-4 sm:p-6 md:p-8 lg:p-10',
  loadingCard:
    'flex justify-center rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-16',
  drawerStack: 'erp-drawer-stack flex flex-col gap-6 sm:gap-8',
  drawerSection:
    'erp-drawer-section flex flex-col gap-4 border-t border-slate-200 pt-6 sm:gap-6 sm:pt-8',
  projectSidebarMenu: 'erp-project-sidebar-menu',
  /** Responsive form / filter card header */
  formHeader:
    'mb-0 flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
  /** Full-width on mobile, fixed width from sm breakpoint */
  filterControl: 'w-full min-w-0 sm:w-[220px]',
  filterControlSm: 'w-full min-w-0 sm:w-[180px]',
  filterControlMd: 'w-full min-w-0 sm:w-[200px]',
  filterControlLg: 'w-full min-w-0 sm:w-[280px]',
  filterControlXl: 'w-full min-w-0 sm:w-[260px]',
  filterControlNav: 'w-full min-w-0 sm:w-[160px]',
  filterControlXs: 'w-full min-w-0 sm:w-[140px]',
} as const;

/** Drawer styles — padding reduced on small viewports via globals.css */
export const antDrawerBodyStyles = {
  body: { padding: '16px 16px' },
  footer: { padding: '16px 16px' },
} as const;

export const antDrawerBodyStylesMd = {
  body: { padding: '24px 32px' },
  footer: { padding: '24px 32px' },
} as const;

export const cardStyles = {
  header: { padding: '16px 16px', minHeight: 'auto' as const },
  body: { padding: '16px' },
  bodyCompact: { padding: '16px' },
} as const;

export const cardStylesMd = {
  header: { padding: '24px 32px', minHeight: 'auto' as const },
  body: { padding: '32px' },
  bodyCompact: { padding: '32px 32px' },
} as const;
