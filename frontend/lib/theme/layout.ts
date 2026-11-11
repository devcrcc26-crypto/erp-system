// UI polish pass - styles only, no logic changes

import type { DrawerProps, ModalProps } from 'antd';
import { tokens } from './tokens';

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
  drawerHeading: 'text-[13px] font-medium leading-[1.5] text-[var(--color-text-primary)]',
  drawerMutedText: 'text-[12px] font-normal leading-[1.5] text-[var(--color-text-secondary)]',
  drawerMetaLabel:
    'text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]',
  drawerSurface:
    'rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-surface-secondary)] p-4',
  drawerDescriptionsClass: 'erp-drawer-descriptions',
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
  traceabilityLinkClass:
    'font-[family-name:var(--font-mono)] text-[12px] font-normal',
} as const;

/** Standard slide-over width (detail views). */
export const DRAWER_WIDTH_STANDARD = 480;

/** Wide slide-over width (complex forms, multi-tab detail). */
export const DRAWER_WIDTH_WIDE = 640;

/** Extra-wide slide-over for submittal workflows with long status steppers. */
export const DRAWER_WIDTH_SUBMITTAL = 900;

export const detailDrawerClassName = 'erp-detail-drawer';
export const responsiveDetailDrawerClassName =
  'erp-detail-drawer erp-responsive-drawer';

export const detailDrawerStyles: NonNullable<DrawerProps['styles']> = {
  header: {
    padding: '0 20px',
    minHeight: 52,
    height: 52,
    borderBottom: `0.5px solid ${tokens.colorBorder}`,
  },
  body: {
    padding: 20,
  },
  footer: {
    padding: '16px 20px',
    borderTop: `0.5px solid ${tokens.colorBorder}`,
  },
  section: {
    borderLeft: `0.5px solid ${tokens.colorBorder}`,
  },
};

/** @deprecated Use detailDrawerStyles */
export const antDrawerBodyStyles = detailDrawerStyles;

/** @deprecated Use detailDrawerStyles */
export const antDrawerBodyStylesMd = detailDrawerStyles;

export const standardDetailDrawerProps: Pick<
  DrawerProps,
  'size' | 'className' | 'styles'
> = {
  size: DRAWER_WIDTH_STANDARD,
  className: responsiveDetailDrawerClassName,
  styles: detailDrawerStyles,
};

export const wideDetailDrawerProps: Pick<
  DrawerProps,
  'size' | 'className' | 'styles'
> = {
  size: DRAWER_WIDTH_WIDE,
  className: responsiveDetailDrawerClassName,
  styles: detailDrawerStyles,
};

export const submittalDrawerProps: Pick<
  DrawerProps,
  'size' | 'className' | 'styles'
> = {
  size: DRAWER_WIDTH_SUBMITTAL,
  className: responsiveDetailDrawerClassName,
  styles: detailDrawerStyles,
};

/** Two-step wizard modals (subtask / discipline edit) - fit within the viewport. */
export const WIZARD_MODAL_WIDTH = 720;

export const wizardModalProps: Pick<
  ModalProps,
  'width' | 'className' | 'centered' | 'destroyOnHidden' | 'styles'
> = {
  width: WIZARD_MODAL_WIDTH,
  className: 'erp-responsive-modal erp-wizard-modal',
  centered: true,
  destroyOnHidden: true,
  styles: {
    body: {
      maxHeight: 'calc(100vh - 220px)',
      overflowY: 'auto',
      paddingTop: 8,
      paddingBottom: 8,
    },
  },
};

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
