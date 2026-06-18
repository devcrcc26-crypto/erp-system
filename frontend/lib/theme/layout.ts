/**
 * Shared layout spacing for page sections and card surfaces.
 */
export const layout = {
  pageStack: 'flex flex-col gap-8 md:gap-10',
  /** Vertical stack inside a single card or panel */
  sectionStack: 'flex flex-col gap-8',
  cardGrid: 'grid gap-8',
  cardSurface:
    'rounded-lg border border-slate-200 bg-white shadow-sm',
  cardPadding: 'p-8 md:p-10',
  loadingCard:
    'flex justify-center rounded-lg border border-slate-200 bg-white p-16 shadow-sm',
  /** Vertical stack inside Ant Design drawers */
  drawerStack: 'erp-drawer-stack flex flex-col gap-8',
  /** Section below a divider inside a drawer */
  drawerSection: 'erp-drawer-section flex flex-col gap-5 border-t border-slate-200 pt-8',
  /** Project workspace secondary nav */
  projectSidebarMenu: 'erp-project-sidebar-menu',
} as const;

/** Consistent Ant Design drawer body/footer padding */
export const antDrawerBodyStyles = {
  body: { padding: '28px 32px' },
  footer: { padding: '20px 32px' },
} as const;

export const cardStyles = {
  header: { padding: '24px 32px', minHeight: 'auto' as const },
  body: { padding: '32px' },
  bodyCompact: { padding: '28px 32px' },
} as const;
