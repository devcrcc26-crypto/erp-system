'use client';

import { Tag } from 'antd';

export type StatusBadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'orange';

const VARIANT_COLORS: Record<
  StatusBadgeVariant,
  { color: string; bg: string; border: string }
> = {
  default: { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  success: { color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  warning: { color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  error: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  info: { color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd' },
  orange: { color: '#c2410c', bg: '#ffedd5', border: '#fed7aa' },
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
      bordered
      style={{
        margin: 0,
        borderRadius: 9999,
        color: colors.color,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        fontWeight: 500,
        fontSize: 12,
        lineHeight: '20px',
        padding: '2px 10px',
      }}
    >
      {label}
    </Tag>
  );
}
