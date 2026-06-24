// UI polish pass - styles only, no logic changes

'use client';

import { Tag } from 'antd';
import { tokens } from '@/lib/theme/tokens';

export type StatusBadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'orange';

const VARIANT_COLORS: Record<
  StatusBadgeVariant,
  { color: string; bg: string }
> = {
  default: { color: tokens.colorGray600, bg: tokens.colorGray50 },
  success: { color: tokens.colorGreen600, bg: tokens.colorGreen50 },
  warning: { color: tokens.colorAmber400, bg: tokens.colorAmber50 },
  error: { color: tokens.colorRed600, bg: tokens.colorRed50 },
  info: { color: tokens.colorBlue400, bg: tokens.colorBlue50 },
  orange: { color: tokens.colorAmber400, bg: tokens.colorAmber50 },
};

export default function StatusBadge({
  label,
  variant = 'default',
}: {
  label: string;
  variant?: StatusBadgeVariant;
}): React.ReactNode {
  const colors = VARIANT_COLORS[variant];

  return (
    <Tag
      variant="filled"
      style={{
        margin: 0,
        borderRadius: 20,
        color: colors.color,
        backgroundColor: colors.bg,
        fontWeight: 500,
        fontSize: 11,
        lineHeight: '1.4',
        padding: '3px 10px',
      }}
    >
      {label}
    </Tag>
  );
}
