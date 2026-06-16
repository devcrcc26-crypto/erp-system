import type { ComponentType, ReactNode } from 'react';
import Card from '@/components/ui/Card/Card';
import { cardStyles } from '@/lib/theme/layout';

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
 * KPI metric card — same layout as the original StatCard, using Ant Design Card.
 */
export default function KPICard({
  label,
  value,
  icon: Icon,
  iconBg = '#f1f5f9',
  iconColor = '#64748b',
  extra,
}: KPICardProps): React.ReactNode {
  return (
    <Card
      variant="borderless"
      styles={cardStyles}
      className="h-full border border-slate-200 shadow-sm"
      style={{ borderRadius: 8, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)' }}
    >
      <div className="flex items-center gap-4">
        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md md:h-12 md:w-12"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
          <p className="text-xs text-slate-500 md:text-sm">{label}</p>
        </div>
        {extra}
      </div>
    </Card>
  );
}
