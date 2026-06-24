// UI polish pass — styles only, no logic changes

/**
 * Shared layout spacing for page sections and card surfaces.
 */
export const layout = {
  pageStack: 'flex flex-col gap-4',
  sectionStack: 'flex flex-col gap-4',
  cardGrid: 'grid gap-3',
  cardSurface:
    'rounded-[12px] border border-[var(--color-border-tertiary)] bg-white',
  cardPadding: 'p-[18px]',
  loadingCard:
    'flex justify-center rounded-[12px] border border-[var(--color-border-tertiary)] bg-white p-8 sm:p-16',
  drawerStack: 'erp-drawer-stack flex flex-col gap-4',
  drawerSection:
    'erp-drawer-section flex flex-col gap-4 border-t border-[var(--color-border-tertiary)] pt-4',
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
  body: { padding: '20px 20px' },
  footer: { padding: '16px 20px' },
} as const;

export const antDrawerBodyStylesMd = {
  body: { padding: '20px 20px' },
  footer: { padding: '16px 20px' },
} as const;

export const cardStyles = {
  header: { padding: '14px 18px', minHeight: 'auto' as const },
  body: { padding: '16px 18px' },
  bodyCompact: { padding: '16px 18px' },
} as const;

export const cardStylesMd = {
  header: { padding: '14px 18px', minHeight: 'auto' as const },
  body: { padding: '16px 18px' },
  bodyCompact: { padding: '16px 18px' },
} as const;

/** Monospace traceability link for document / record numbers in tables */
export const traceabilityLinkClass =
  'font-[family-name:var(--font-mono)] text-[12px] font-normal';
