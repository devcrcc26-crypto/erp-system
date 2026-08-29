'use client';

import Image from 'next/image';

const LOGO_SRC = '/ccecc-logo.png';

/**
 * CCECC brand mark — used on login, shell nav, and related chrome.
 */
export default function BrandLogo({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}): React.ReactNode {
  return (
    <Image
      src={LOGO_SRC}
      alt="CCECC"
      width={size}
      height={size}
      className={['object-contain', className].filter(Boolean).join(' ')}
      priority={priority}
    />
  );
}
