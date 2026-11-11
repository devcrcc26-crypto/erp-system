'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCount } from '../../format';
import OverviewEmptyState from './OverviewEmptyState';
import { BAR_FILL, CHART_TEXT } from './overview-tokens';
import { BarChart3 } from 'lucide-react';

export interface HorizontalBarDatum {
  label: string;
  value: number;
  color?: string;
}

function ValueTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: HorizontalBarDatum }>;
  locale: string;
}): React.ReactNode {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs shadow-md">
      <p className="m-0 font-medium text-slate-700">{row.label}</p>
      <p className="m-0 mt-0.5 font-semibold tabular-nums text-slate-900">
        {formatCount(row.value, locale)}
      </p>
    </div>
  );
}

/** Polished single-series horizontal bar list (e.g. team OT by person). */
export default function HorizontalBarList({
  data,
  emptyLabel,
  ariaLabel,
  locale,
  fill = BAR_FILL,
}: {
  data: readonly HorizontalBarDatum[];
  emptyLabel: string;
  ariaLabel: string;
  locale: string;
  fill?: string;
}): React.ReactNode {
  const rows = data.filter((row) => row.value > 0);
  if (rows.length === 0) {
    return <OverviewEmptyState icon={BarChart3} title={emptyLabel} compact />;
  }

  const height = Math.max(180, rows.length * 40 + 24);

  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 36, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_TEXT, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }}
            content={<ValueTooltip locale={locale} />}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18} isAnimationActive>
            {rows.map((row) => (
              <Cell key={row.label} fill={row.color ?? fill} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              formatter={(value: unknown) =>
                typeof value === 'number' ? formatCount(value, locale) : ''
              }
              style={{ fill: '#0f172a', fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
