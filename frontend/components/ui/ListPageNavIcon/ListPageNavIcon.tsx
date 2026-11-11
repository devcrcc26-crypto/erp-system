'use client';

import type { CSSProperties } from 'react';
import {
  getNavIconComponent,
  navIconClassName,
} from '@/lib/navigation/nav-icons';
import { tokens } from '@/lib/theme/tokens';

export interface ListPageNavIconProps {
  iconKey: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders the sidebar navigation icon for a list/table page header.
 */
export default function ListPageNavIcon({
  iconKey,
  className,
  style,
}: ListPageNavIconProps): React.ReactNode {
  const Icon = getNavIconComponent(iconKey);

  return (
    <Icon
      aria-hidden
      className={[navIconClassName, className].filter(Boolean).join(' ')}
      style={{ color: tokens.colorPrimary, fontSize: 16, ...style }}
    />
  );
}
