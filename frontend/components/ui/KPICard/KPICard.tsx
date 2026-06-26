// UI polish pass - styles only, no logic changes

import type { ComponentType, ReactNode } from 'react';
import Card from '@/components/ui/Card/Card';
import { tokens } from '@/lib/theme/tokens';

type IconProps = {
  size?: number;
  className?: string;
  width?: number | string;
  height?: number | string;
};

type KPICardProps = {
  label: string;
  value: string;
  icon?: ComponentType<IconProps>;
  iconBg?: string;
  iconColor?: string;
  extra?: ReactNode;
};

/**
 * KPI metric card - design-system stat surface.
 */
export default function KPICard({
  label,
  value,
  icon: Icon,
  iconBg = tokens.colorSurfaceSecondary,
  iconColor = tokens.colorTextSecondary,
  extra,
}: KPICardProps): React.ReactNode {
  return (
    <Card
      variant="borderless"
      styles={{
        body: { padding: '16px 18px' },
      }}
      className="h-full erp-responsive-card"
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        boxShadow: 'none',
        background: tokens.colorCardBg,
      }}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            <Icon className="text-base" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-[24px] font-medium leading-none tracking-[-0.02em]"
            style={{ color: tokens.colorTextPrimary }}
          >
            {value}
          </p>
          <p
            className="mt-1 text-[11px] font-normal leading-[1.4]"
            style={{ color: tokens.colorTextTertiary }}
          >
            {label}
          </p>
        </div>
        {extra}
      </div>
    </Card>
  );
}
