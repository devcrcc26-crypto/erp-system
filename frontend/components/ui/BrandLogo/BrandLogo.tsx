'use client';

/**
 * CRCC text brand mark — used on shell nav and related chrome.
 * Logo image removed; brand is text-only.
 */
export default function BrandLogo({
  size = 32,
  className,
  onDark = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  onDark?: boolean;
}): React.ReactNode {
  const fontSize = Math.max(12, Math.round(size * 0.45));

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center font-semibold tracking-wide',
        onDark ? 'text-white' : 'text-[var(--sb-text,#1B2B4B)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: size,
        minWidth: size,
        fontSize,
        lineHeight: 1,
      }}
      aria-hidden={false}
    >
      CRCC
    </span>
  );
}
