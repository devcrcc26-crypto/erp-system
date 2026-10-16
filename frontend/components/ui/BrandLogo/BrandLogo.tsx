'use client';

import Image from 'next/image';

const LOGO_SRC = '/ccecc-logo.png';

/**
 * CCECC brand mark - used on login, shell nav, and related chrome.
 * Use `onDark` on dark surfaces so the blue mark sits on a light tile.
 */
export default function BrandLogo({
  size = 32,
  className,
  priority = false,
  onDark = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  onDark?: boolean;
}): React.ReactNode {
  const image = (
    <Image
      src={LOGO_SRC}
      alt="CCECC"
      width={size}
      height={size}
      className={[
        'object-contain',
        onDark ? undefined : className,
      ]
        .filter(Boolean)
        .join(' ')}
      priority={priority}
    />
  );

  if (!onDark) {
    return image;
  }

  const pad = Math.max(2, Math.round(size * 0.1));
  const tile = size + pad * 2;

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center bg-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: tile,
        height: tile,
        borderRadius: Math.round(tile * 0.22),
        padding: pad,
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.12)',
      }}
    >
      {image}
    </span>
  );
}
