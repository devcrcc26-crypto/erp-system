/**
 * Shared layout spacing for page sections and card surfaces.
 */
export const layout = {
  pageStack: 'flex flex-col gap-6 md:gap-8',
  cardGrid: 'grid gap-6',
  cardSurface:
    'rounded-lg border border-slate-200 bg-white shadow-sm',
  cardPadding: 'p-6 md:p-8',
  loadingCard:
    'flex justify-center rounded-lg border border-slate-200 bg-white p-16 shadow-sm',
} as const;

export const cardStyles = {
  header: { padding: '20px 28px', minHeight: 'auto' as const },
  body: { padding: '28px' },
  bodyCompact: { padding: '24px 28px' },
} as const;
