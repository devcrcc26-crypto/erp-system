'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatCount } from '../../format';
import OverviewEmptyState from './OverviewEmptyState';
import { CHART_GRID, CHART_TEXT, OT_SERIES_COLORS } from './overview-tokens';
import { Timer } from 'lucide-react';

const HOME = 'pages.dashboard.home';

export interface OtEmployeeRow {
  employeeId: string;
  name: string;
  normal: number;
  evening: number;
  sunday: number;
  holiday: number;
  total: number;
}

interface ChartRow {
  name: string;
  normal: number;
  evening: number;
  sunday: number;
  holiday: number;
  total: number;
}

function OtTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name: string; value: number; color: string; payload: ChartRow }>;
  locale: string;
}): React.ReactNode {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs shadow-md">
      <p className="m-0 mb-1.5 font-semibold text-slate-900">{row.name}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="m-0 flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatCount(entry.value, locale)}
          </span>
        </p>
      ))}
      <p className="m-0 mt-1.5 border-t border-slate-100 pt-1.5 font-semibold tabular-nums text-slate-900">
        {formatCount(row.total, locale)}
      </p>
    </div>
  );
}

/**
 * Horizontal stacked bar of overtime hours by employee (normal / evening /
 * sunday / holiday). Rows are sorted by total descending; height scales with
 * the number of people so labels stay readable.
 */
export default function OtStackedBarChart({
  data,
  emptyLabel,
  ariaLabel,
}: {
  data: readonly OtEmployeeRow[];
  emptyLabel: string;
  ariaLabel: string;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const rows = useMemo<ChartRow[]>(
    () =>
      [...data]
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map((row) => ({
          name: row.name,
          normal: row.normal,
          evening: row.evening,
          sunday: row.sunday,
          holiday: row.holiday,
          total: row.total,
        })),
    [data],
  );

  if (rows.length === 0) {
    return <OverviewEmptyState icon={Timer} title={emptyLabel} compact />;
  }

  const height = Math.max(220, rows.length * 40 + 56);
  const series = [
    { key: 'normal' as const, label: t(`${HOME}.charts.normal`), color: OT_SERIES_COLORS.normal },
    { key: 'evening' as const, label: t(`${HOME}.charts.evening`), color: OT_SERIES_COLORS.evening },
    { key: 'sunday' as const, label: t(`${HOME}.charts.sunday`), color: OT_SERIES_COLORS.sunday },
    { key: 'holiday' as const, label: t(`${HOME}.charts.holiday`), color: OT_SERIES_COLORS.holiday },
  ];

  return (
    <div
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
          barCategoryGap={12}
        >
          <CartesianGrid horizontal={false} stroke={CHART_GRID} strokeDasharray="3 6" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_TEXT, fontSize: 11 }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_TEXT, fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }} content={<OtTooltip locale={locale} />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: CHART_TEXT, paddingBottom: 8 }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="ot"
              fill={s.color}
              maxBarSize={18}
              radius={i === series.length - 1 ? [0, 6, 6, 0] : [0, 0, 0, 0]}
              isAnimationActive
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t(`${HOME}.charts.employee`)}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td>{row.normal}</td>
              <td>{row.evening}</td>
              <td>{row.sunday}</td>
              <td>{row.holiday}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
