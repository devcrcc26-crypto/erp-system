'use client';

import Image from 'next/image';

const LOGO_SRC = '/crcc-logo.jpg';

/**
 * CRCC brand mark — globe + wordmark for shell nav and auth chrome.
 */
export default function BrandLogo({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  /** Kept for callers; logo artwork includes its own colours. */
  onDark?: boolean;
}): React.ReactNode {
  return (
    <Image
      src={LOGO_SRC}
      alt="CRCC"
      width={size}
      height={size}
      priority={priority}
      className={['shrink-0 object-contain', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    />
  );
}
