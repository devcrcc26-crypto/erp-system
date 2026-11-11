'use client';

/**
 * Counter pill. The digits are decorative; screen readers hear the full
 * sentence from visually hidden text (e.g. "3 pending approvals"), which is
 * announced as part of the owning link's name.
 *
 * Visually hidden text is used instead of `aria-label` on the span because
 * ARIA 1.2 prohibits naming generic elements, so assistive tech may drop it.
 */
export default function SidebarBadge({
  count,
  label,
  floating = false,
}: {
  count: number;
  /** Full screen reader sentence including the count. */
  label: string;
  /** Pins the badge to the icon corner (compact rail tiles). */
  floating?: boolean;
}): React.ReactNode {
  if (count <= 0) {
    return null;
  }

  return (
    <span className={floating ? 'sb-badge sb-badge--floating' : 'sb-badge'}>
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
