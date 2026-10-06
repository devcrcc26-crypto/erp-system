'use client';

import { BarChart3 } from 'lucide-react';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { tokens } from '@/lib/theme/tokens';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
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

function ChartEmpty({ description }: { description: string }): React.ReactNode {
  return (
    <TableEmptyState
      icon={<BarChart3 />}
      title="No data"
      description={description}
    />
  );
}

export function HrDonutChart({
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
    <div className="flex h-full min-w-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1" style={{ minHeight: 200 }}>
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
              paddingAngle={2}
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
}: {
  data: HrChartDatum[];
  emptyDescription: string;
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
}: {
  data: HrChartDatum[];
  emptyDescription: string;
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
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
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
