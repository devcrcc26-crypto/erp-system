// UI polish pass — styles only, no logic changes

"use client";

import { useState } from "react";
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
} from "recharts";

const taskStatusData = [
  { name: "Current Week", value: 72, color: tokens.colorTeal400 },
  { name: "Planned (Future)", value: 28, color: tokens.colorBlue400 },
];

const disciplineData = [
  { name: "Architecture", value: 42 },
  { name: "Management", value: 0 },
];

const priorityData = [
  { name: "High", value: 57, color: tokens.colorRed400 },
  { name: "Medium", value: 34, color: tokens.colorAmber400 },
  { name: "Low", value: 12, color: tokens.colorGreen400 },
];

const CHART_HEIGHT = 200;

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
          className="text-[13px] font-medium leading-[1.5]"
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
        <div style={{ width: "100%", height: CHART_HEIGHT }}>{children}</div>
      </div>
    </div>
  );
}

function CompletionGauge({ value }: { value: number }) {
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

function DisciplineDumbbell() {
  const [tip, setTip] = useState<{ label: string; value: number; y: number } | null>(null);

  const W = 120;
  const cx = W / 2;
  const GAP = 8;
  const R = 5;
  const L = 62;

  const archLabelY = 13;
  const archDotY = archLabelY + 14;
  const blueTopY = archDotY + R + GAP;
  const blueBotY = blueTopY + L;
  const mgmtDotY = blueBotY + GAP + R;
  const grayTopY = mgmtDotY + R + GAP;
  const grayBotY = grayTopY + L;
  const mgmtLabelY = grayBotY + GAP + 10;
  const H = mgmtLabelY + 4;

  const tipW = 48;
  const tipH = 20;

  return (
    <div style={{ height: CHART_HEIGHT }} className="flex items-center justify-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        <text
          x={cx}
          y={archLabelY}
          textAnchor="middle"
          fontSize="11"
          fontWeight="500"
          fill={tokens.colorTextPrimary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          {disciplineData[0].name}
        </text>

        <circle
          cx={cx}
          cy={archDotY}
          r={R + 4}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() =>
            setTip({ label: disciplineData[0].name, value: disciplineData[0].value, y: archDotY })
          }
          onMouseLeave={() => setTip(null)}
        />
        <circle
          cx={cx}
          cy={archDotY}
          r={R}
          fill={tokens.colorBlue400}
          style={{ pointerEvents: "none" }}
        />

        <line
          x1={cx}
          y1={blueTopY}
          x2={cx}
          y2={blueBotY}
          stroke={tokens.colorBlue400}
          strokeWidth={2}
          strokeLinecap="round"
        />

        <circle
          cx={cx}
          cy={mgmtDotY}
          r={R + 4}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() =>
            setTip({ label: disciplineData[1].name, value: disciplineData[1].value, y: mgmtDotY })
          }
          onMouseLeave={() => setTip(null)}
        />
        <circle
          cx={cx}
          cy={mgmtDotY}
          r={R}
          fill={tokens.colorBlue400}
          style={{ pointerEvents: "none" }}
        />

        <line
          x1={cx}
          y1={grayTopY}
          x2={cx}
          y2={grayBotY}
          stroke={tokens.colorGray100}
          strokeWidth={2}
          strokeLinecap="round"
        />

        <text
          x={cx}
          y={mgmtLabelY}
          textAnchor="middle"
          fontSize="11"
          fontWeight="500"
          fill={tokens.colorTextPrimary}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          {disciplineData[1].name}
        </text>

        {tip && (
          <g>
            <rect
              x={cx + R + 6}
              y={tip.y - tipH / 2}
              width={tipW}
              height={tipH}
              rx={8}
              fill={tokens.colorTextPrimary}
            />
            <text
              x={cx + R + 6 + tipW / 2}
              y={tip.y + 4}
              textAnchor="middle"
              fontSize="10"
              fill={tokens.colorCardBg}
              fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            >
              {tip.label}: {tip.value}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function DashboardCharts() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ChartCard title="Task Status" subtitle="Current vs Planned">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT - 30}>
          <PieChart>
            <Pie
              data={taskStatusData}
              dataKey="value"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
            >
              {taskStatusData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${v}%`} />
          </PieChart>
        </ResponsiveContainer>
        <div
          className="mt-1 flex justify-center gap-4 text-[11px] font-normal"
          style={{ color: tokens.colorTextSecondary }}
        >
          {taskStatusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Discipline Workload" subtitle="Active tasks by discipline">
        <DisciplineDumbbell />
      </ChartCard>

      <ChartCard title="Priority Breakdown" subtitle="Tasks by priority level">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={priorityData}
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
              {priorityData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Overall Completion" subtitle="% of tasks completed">
        <CompletionGauge value={63} />
      </ChartCard>
    </section>
  );
}
