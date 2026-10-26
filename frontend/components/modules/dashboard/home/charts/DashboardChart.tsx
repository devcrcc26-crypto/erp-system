'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from 'antd';

/** Charts need the DOM / canvas, so they are never server-rendered. */
const ChartSkeleton = (): React.ReactNode => (
  <Skeleton active title={false} paragraph={{ rows: 4 }} />
);

const Bar = dynamic(() => import('@ant-design/charts').then((m) => m.Bar), {
  ssr: false,
  loading: ChartSkeleton,
});

const Pie = dynamic(() => import('@ant-design/charts').then((m) => m.Pie), {
  ssr: false,
  loading: ChartSkeleton,
});

/** Chart palette (canvas cannot read CSS variables). Mirrors --dv2-* tones. */
export const DASHBOARD_CHART_COLORS = {
  urgent: '#b42318',
  urgentDark: '#7a1a12',
  warn: '#d9730d',
  caution: '#eab308',
  primary: '#1d9e75',
  blue: '#2563eb',
  purple: '#7c3aed',
  orange: '#ea580c',
  red: '#dc2626',
  text: '#1f2937',
  muted: '#4b5563',
  grid: '#eef1f4',
} as const;

const DONUT_PALETTE: readonly string[] = [
  DASHBOARD_CHART_COLORS.primary,
  DASHBOARD_CHART_COLORS.blue,
  DASHBOARD_CHART_COLORS.purple,
  DASHBOARD_CHART_COLORS.orange,
  DASHBOARD_CHART_COLORS.caution,
  DASHBOARD_CHART_COLORS.red,
  '#0891b2',
  '#64748b',
];

const DEFAULT_HEIGHT = 220;
const ROW_HEIGHT = 36;
const STACKED_MIN_HEIGHT = 240;
const STACKED_CHROME = 72;
const DONUT_HEIGHT = 240;

const AXIS_LABEL_STYLE = {
  fill: DASHBOARD_CHART_COLORS.muted,
  fontSize: 12,
} as const;

const VALUE_LABEL_STYLE = {
  fill: DASHBOARD_CHART_COLORS.text,
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'start',
  dx: 6,
} as const;

export interface DashboardBarDatum {
  label: string;
  value: number;
  color?: string;
}

interface ChartStateProps {
  loading?: boolean;
  emptyLabel: string;
  height?: number;
  /** Short text summary for assistive technology. */
  ariaLabel?: string;
}

function ChartFrame({
  loading,
  isEmpty,
  emptyLabel,
  height,
  ariaLabel,
  srRows,
  children,
}: {
  loading: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  height: number;
  ariaLabel?: string;
  srRows?: readonly { label: string; value: string | number }[];
  children: React.ReactNode;
}): React.ReactNode {
  if (loading) {
    return (
      <div className="dv2-chart" style={{ minHeight: height }} role="status" aria-busy="true">
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div
        className="dv2-chart dv2-chart--empty"
        style={{ minHeight: Math.min(height, 120) }}
      >
        <p className="dv2-empty m-0">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div
      className="dv2-chart"
      style={{ minHeight: height }}
      role="region"
      aria-label={ariaLabel}
    >
      <div aria-hidden="true">{children}</div>
      {srRows && srRows.length > 0 ? (
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <tbody>
            {srRows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function summarize(rows: readonly { label: string; value: number }[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join(', ');
}

/** Horizontal bar chart with one bar per row and a value label at the end. */
export function DashboardBarChart({
  data,
  loading = false,
  emptyLabel,
  height = DEFAULT_HEIGHT,
  ariaLabel,
}: ChartStateProps & { data: readonly DashboardBarDatum[] }): React.ReactNode {
  const rows = [...data];
  const hasValues = rows.some((row) => row.value > 0);
  const colors = rows.map((row) => row.color ?? DASHBOARD_CHART_COLORS.primary);

  return (
    <ChartFrame
      loading={loading}
      isEmpty={!hasValues}
      emptyLabel={emptyLabel}
      height={height}
      ariaLabel={ariaLabel ?? summarize(rows)}
      srRows={rows}
    >
      <Bar
        data={rows}
        xField="label"
        yField="value"
        colorField="label"
        autoFit
        height={height}
        paddingRight={40}
        legend={false}
        scale={{
          color: { domain: rows.map((row) => row.label), range: colors },
          y: { nice: true, domainMin: 0 },
        }}
        label={{ text: 'value', position: 'right', style: VALUE_LABEL_STYLE }}
        axis={{
          x: { labelFill: AXIS_LABEL_STYLE.fill, labelFontSize: 12 },
          y: { labelFill: AXIS_LABEL_STYLE.fill, labelFontSize: 12, tickCount: 4 },
        }}
        style={{ maxWidth: 26, radiusTopRight: 4, radiusBottomRight: 4 }}
      />
    </ChartFrame>
  );
}

export interface DashboardStackedBarDatum {
  name: string;
  normal: number;
  evening: number;
  sunday: number;
  holiday: number;
}

export interface DashboardStackedSeriesLabels {
  normal: string;
  evening: string;
  sunday: string;
  holiday: string;
}

interface StackedRow {
  name: string;
  type: string;
  hours: number;
}

/** Stacked horizontal bars: overtime hours per employee split by pay category. */
export function DashboardStackedBarChart({
  data,
  seriesLabels,
  loading = false,
  emptyLabel,
  height,
  ariaLabel,
}: Omit<ChartStateProps, 'height'> & {
  data: readonly DashboardStackedBarDatum[];
  seriesLabels: DashboardStackedSeriesLabels;
  height?: number;
}): React.ReactNode {
  const rows: StackedRow[] = data.flatMap((row) => [
    { name: row.name, type: seriesLabels.normal, hours: row.normal },
    { name: row.name, type: seriesLabels.evening, hours: row.evening },
    { name: row.name, type: seriesLabels.sunday, hours: row.sunday },
    { name: row.name, type: seriesLabels.holiday, hours: row.holiday },
  ]);
  const hasValues = rows.some((row) => row.hours > 0);
  const resolvedHeight =
    height ?? Math.max(STACKED_MIN_HEIGHT, data.length * ROW_HEIGHT + STACKED_CHROME);
  const summary = data
    .map(
      (row) =>
        `${row.name}: ${row.normal + row.evening + row.sunday + row.holiday}`,
    )
    .join(', ');

  return (
    <ChartFrame
      loading={loading}
      isEmpty={!hasValues}
      emptyLabel={emptyLabel}
      height={resolvedHeight}
      ariaLabel={ariaLabel ?? summary}
      srRows={data.map((row) => ({
        label: row.name,
        value: `${seriesLabels.normal}: ${row.normal}, ${seriesLabels.evening}: ${row.evening}, ${seriesLabels.sunday}: ${row.sunday}, ${seriesLabels.holiday}: ${row.holiday}`,
      }))}
    >
      <Bar
        data={rows}
        xField="name"
        yField="hours"
        colorField="type"
        stack
        autoFit
        height={resolvedHeight}
        scale={{
          color: {
            domain: [
              seriesLabels.normal,
              seriesLabels.evening,
              seriesLabels.sunday,
              seriesLabels.holiday,
            ],
            range: [
              DASHBOARD_CHART_COLORS.blue,
              DASHBOARD_CHART_COLORS.purple,
              DASHBOARD_CHART_COLORS.orange,
              DASHBOARD_CHART_COLORS.red,
            ],
          },
          y: { nice: true, domainMin: 0 },
        }}
        legend={{ color: { position: 'bottom', layout: { justifyContent: 'center' } } }}
        axis={{
          x: { labelFill: AXIS_LABEL_STYLE.fill, labelFontSize: 12 },
          y: { labelFill: AXIS_LABEL_STYLE.fill, labelFontSize: 12, tickCount: 5 },
        }}
        style={{ maxWidth: 24 }}
      />
    </ChartFrame>
  );
}

export interface DashboardDonutDatum {
  label: string;
  value: number;
}

/** Donut chart: share of each category, with counts as slice labels. */
export function DashboardDonutChart({
  data,
  loading = false,
  emptyLabel,
  height = DONUT_HEIGHT,
  ariaLabel,
}: ChartStateProps & { data: readonly DashboardDonutDatum[] }): React.ReactNode {
  const rows = data.filter((row) => row.value > 0);

  return (
    <ChartFrame
      loading={loading}
      isEmpty={rows.length === 0}
      emptyLabel={emptyLabel}
      height={height}
      ariaLabel={ariaLabel ?? summarize(rows)}
      srRows={rows}
    >
      <Pie
        data={rows}
        angleField="value"
        colorField="label"
        innerRadius={0.62}
        autoFit
        height={height}
        scale={{
          color: {
            domain: rows.map((row) => row.label),
            range: [...DONUT_PALETTE],
          },
        }}
        label={{
          text: 'value',
          position: 'inside',
          style: { fill: '#ffffff', fontSize: 12, fontWeight: 600 },
        }}
        legend={{ color: { position: 'bottom', layout: { justifyContent: 'center' } } }}
      />
    </ChartFrame>
  );
}
