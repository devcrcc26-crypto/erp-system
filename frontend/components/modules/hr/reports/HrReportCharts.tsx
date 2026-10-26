'use client';

import { BarChart3 } from 'lucide-react';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { tokens } from '@/lib/theme/tokens';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface HrChartDatum {
  name: string;
  value: number;
  color?: string;
}

const CHART_COLORS = [
  tokens.colorTeal400,
  tokens.colorBlue400,
  tokens.colorAmber400,
  tokens.colorCoral400,
  tokens.colorGreen400,
  tokens.colorCyan400,
  tokens.colorRed400,
  tokens.colorTeal600,
  tokens.colorBlue800,
  tokens.colorGreen600,
] as const;

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: `1px solid ${tokens.colorBorder}`,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(16, 24, 40, 0.08)',
};

export function colorForIndex(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? tokens.colorTeal400;
}

export function toChartData(
  rows: Array<{ name: string; value: number }>,
): HrChartDatum[] {
  return rows
    .filter((row) => row.value > 0)
    .map((row, index) => ({
      name: row.name,
      value: row.value,
      color: colorForIndex(index),
    }));
}

function hasChartData(data: HrChartDatum[]): boolean {
  return data.length > 0 && data.some((entry) => entry.value > 0);
}

function ChartEmpty({
  description,
  compact = false,
}: {
  description: string;
  compact?: boolean;
}): React.ReactNode {
  if (compact) {
    return (
      <p
        className="m-0 py-3 text-center text-[13px]"
        style={{ color: tokens.colorTextSecondary }}
      >
        {description}
      </p>
    );
  }
  return (
    <TableEmptyState
      icon={<BarChart3 />}
      title="No data"
      description={description}
    />
  );
}

const DONUT_HEIGHT = 280;

export function HrDonutChart({
  data,
  emptyDescription,
  compactEmpty = false,
}: {
  data: HrChartDatum[];
  emptyDescription: string;
  /** One-line empty message instead of the full empty state. */
  compactEmpty?: boolean;
}): React.ReactNode {
  if (!hasChartData(data)) {
    return (
      <ChartEmpty description={emptyDescription} compact={compactEmpty} />
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      {/* Fixed pixel height: a percentage height inside a min-height-only box resolves to 0. */}
      <div className="min-w-0" style={{ height: DONUT_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="42%"
              outerRadius="68%"
              paddingAngle={data.length > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.color ?? tokens.colorTeal600}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div
        className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px]"
        style={{ color: tokens.colorTextSecondary }}
      >
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color ?? tokens.colorTeal600 }}
            />
            <span>
              {item.name} ({item.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HrPieChart({
  data,
  emptyDescription,
}: {
  data: HrChartDatum[];
  emptyDescription: string;
}): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description={emptyDescription} />;
  }

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 12, right: 24, bottom: 28, left: 24 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="46%"
            outerRadius="58%"
            paddingAngle={1}
            label={({ name, percent }) =>
              percent != null && percent >= 0.08
                ? `${name} ${Math.round(percent * 100)}%`
                : ''
            }
            labelLine
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.color ?? tokens.colorTeal600}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrHorizontalBarChart({
  data,
  emptyDescription,
  valueFormatter,
  maxValue,
}: {
  data: HrChartDatum[];
  emptyDescription: string;
  /** Formats axis ticks and tooltip values (e.g. ETB or %). */
  valueFormatter?: (value: number) => string;
  /** Fixed axis maximum, e.g. 100 for percentages. */
  maxValue?: number;
}): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description={emptyDescription} />;
  }

  const height = Math.max(200, data.length * 36);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            domain={maxValue != null ? [0, maxValue] : undefined}
            tickFormatter={valueFormatter}
            tick={{ fill: tokens.colorTextTertiary, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fill: tokens.colorTextSecondary, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: tokens.colorSurfaceSecondary }}
            contentStyle={TOOLTIP_STYLE}
            formatter={
              valueFormatter
                ? (value) => valueFormatter(Number(value))
                : undefined
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.color ?? tokens.colorTeal600}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrVerticalBarChart({
  data,
  emptyDescription,
  selectedName,
  onSelect,
}: {
  data: HrChartDatum[];
  emptyDescription: string;
  /** Highlights this bar and dims the rest. */
  selectedName?: string | null;
  /** Makes bars clickable; called with the clicked bar's name. */
  onSelect?: (name: string) => void;
}): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description={emptyDescription} />;
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
        >
          <XAxis
            dataKey="name"
            tick={{ fill: tokens.colorTextSecondary, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: tokens.colorTextTertiary, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: tokens.colorSurfaceSecondary }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            barSize={28}
            onClick={
              onSelect
                ? (entry: { name?: string }) => {
                    if (entry.name) onSelect(entry.name);
                  }
                : undefined
            }
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.color ?? tokens.colorTeal600}
                fillOpacity={
                  selectedName && selectedName !== entry.name ? 0.35 : 1
                }
                cursor={onSelect ? 'pointer' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrLineChart({
  data,
  emptyDescription,
  color = tokens.colorTeal400,
}: {
  data: HrChartDatum[];
  emptyDescription: string;
  color?: string;
}): React.ReactNode {
  if (!hasChartData(data)) {
    return <ChartEmpty description={emptyDescription} />;
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 24, right: 24, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            vertical={false}
            stroke={tokens.colorBorder}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="name"
            tick={{ fill: tokens.colorTextSecondary, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: tokens.colorTextTertiary, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              position="top"
              offset={10}
              style={{ fill: tokens.colorTextSecondary, fontSize: 11 }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
