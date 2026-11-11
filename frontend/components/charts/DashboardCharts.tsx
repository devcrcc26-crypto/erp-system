// UI polish pass - styles only, no logic changes

'use client';

import { Spin } from 'antd';
import { BarChart3 } from 'lucide-react';
import TableEmptyState from '@/components/ui/TableEmptyState';
import type { DashboardChartData, DashboardChartDatum } from '@/lib/dashboard/types';
import { tokens } from '@/lib/theme/tokens';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_HEIGHT = 200;

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <div
        className="shrink-0 px-[18px] py-[14px]"
        style={{ borderBottom: `0.5px solid ${tokens.colorBorder}` }}
      >
        <h3
          className="text-[15px] font-semibold leading-[1.4] tracking-[-0.01em]"
          style={{ color: tokens.colorTextPrimary }}
        >
          {title}
        </h3>
        <p
          className="mt-0.5 text-[10px] font-normal leading-[1.4]"
          style={{ color: tokens.colorTextTertiary }}
        >
          {subtitle}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-[18px] py-4">
        <div style={{ width: '100%', height: CHART_HEIGHT }}>{children}</div>
      </div>
    </div>
  );
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

function hasChartData(data: DashboardChartDatum[]): boolean {
  return data.length > 0 && data.some((entry) => entry.value > 0);
}

function CompletionGauge({ value }: { value: number }): React.ReactNode {
  const r = 90;
  const cx = 110;
  const cy = 125;
  const arcLength = Math.PI * r;
  const filled = (value / 100) * arcLength;

  return (
    <div className="flex h-full items-center justify-center">
      <svg width="220" height="150" viewBox="0 0 220 150">
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={tokens.colorGray100}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={tokens.colorGreen400}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`}
        />
        <text
          x={cx}
          y={cy - 62}
          textAnchor="middle"
          fontSize="10"
          fill={tokens.colorTextTertiary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          {value} / 100
        </text>
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fontSize="24"
          fontWeight="500"
          fill={tokens.colorTextPrimary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
          letterSpacing="-0.02em"
        >
          {value}%
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="11"
          fill={tokens.colorTextSecondary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          Progress
        </text>
      </svg>
    </div>
  );
}

function DisciplineWorkloadBars({
  data,
}: {
  data: DashboardChartDatum[];
}): React.ReactNode {
  if (data.length === 0 || !data.some((entry) => entry.value > 0)) {
    return (
      <ChartEmpty description="Active disciplines will appear when schedule data exists" />
    );
  }

  const rows = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: tokens.colorTextTertiary }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={88}
          tick={{ fontSize: 11, fill: tokens.colorTextSecondary }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip />
        <Bar
          dataKey="value"
          fill={tokens.colorBlue400}
          radius={[0, 4, 4, 0]}
          barSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartLoading(): React.ReactNode {
  return (
    <div className="flex h-full items-center justify-center">
      <Spin size="small" />
    </div>
  );
}

export default function DashboardCharts({
  data,
  loading = false,
  taskCount = 0,
}: {
  data: DashboardChartData;
  loading?: boolean;
  taskCount?: number;
}): React.ReactNode {
  const emptyDescription =
    taskCount === 0
      ? 'Adjust filters or add schedule tasks to populate charts'
      : 'No chart data for the current filter selection';

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ChartCard title="Task Status" subtitle="Current vs Planned">
        {loading ? (
          <ChartLoading />
        ) : hasChartData(data.taskTimeline) ? (
          <>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT - 30}>
              <PieChart>
                <Pie
                  data={data.taskTimeline}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.taskTimeline.map((entry) => (
                    <Cell key={entry.name} fill={entry.color ?? tokens.colorTeal400} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div
              className="mt-1 flex justify-center gap-4 text-[11px] font-normal"
              style={{ color: tokens.colorTextSecondary }}
            >
              {data.taskTimeline.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color ?? tokens.colorTeal400 }}
                  />
                  {item.name}
                </div>
              ))}
            </div>
          </>
        ) : (
          <ChartEmpty description={emptyDescription} />
        )}
      </ChartCard>

      <ChartCard title="Discipline Workload" subtitle="Active tasks by discipline">
        {loading ? (
          <ChartLoading />
        ) : (
          <DisciplineWorkloadBars data={data.disciplineWorkload} />
        )}
      </ChartCard>

      <ChartCard title="Priority Breakdown" subtitle="Tasks by priority level">
        {loading ? (
          <ChartLoading />
        ) : hasChartData(data.priorityBreakdown) ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart
              data={data.priorityBreakdown}
              margin={{ left: -16, right: 8, top: 4, bottom: 4 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: tokens.colorTextSecondary }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: tokens.colorTextTertiary }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={36}>
                {data.priorityBreakdown.map((entry) => (
                  <Cell key={entry.name} fill={entry.color ?? tokens.colorTeal400} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty description={emptyDescription} />
        )}
      </ChartCard>

      <ChartCard title="Overall Completion" subtitle="% of tasks completed">
        {loading ? (
          <ChartLoading />
        ) : taskCount > 0 ? (
          <CompletionGauge value={data.completionRate} />
        ) : (
          <ChartEmpty description={emptyDescription} />
        )}
      </ChartCard>
    </section>
  );
}
