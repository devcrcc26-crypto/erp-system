"use client";

import { useState } from "react";
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
  { name: "Current Week",   value: 72, color: "#f97316" },
  { name: "Planned (Future)", value: 28, color: "#3b82f6" },
];

const disciplineData = [
  { name: "Architecture", value: 42 },
  { name: "Management",   value: 0  },
];

const priorityData = [
  { name: "High",   value: 57, color: "#ef4444" },
  { name: "Medium", value: 34, color: "#f97316" },
  { name: "Low",    value: 12, color: "#22c55e" },
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
    <div className="rounded-md bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mb-4 text-sm text-slate-500">{subtitle}</p>
      {/* Fixed pixel height so ResponsiveContainer can measure it */}
      <div style={{ width: "100%", height: CHART_HEIGHT }}>{children}</div>
    </div>
  );
}

function CompletionGauge({ value }: { value: number }) {
  const r         = 90;
  const cx        = 110;
  const cy        = 125;
  const arcLength = Math.PI * r;
  const filled    = (value / 100) * arcLength;

  return (
    <div className="flex h-full items-center justify-center">
      <svg width="220" height="150" viewBox="0 0 220 150">
        {/* Background arc */}
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="18"
          strokeLinecap="butt"
        />
        {/* Filled arc */}
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#22c55e"
          strokeWidth="18"
          strokeLinecap="butt"
          strokeDasharray={`${filled} ${arcLength}`}
        />
        {/* 63/100 — small label above percentage */}
        <text
          x={cx} y={cy - 62}
          textAnchor="middle"
          fontSize="12"
          fill="#94a3b8"
          fontFamily="sans-serif"
        >
          {value} / 100
        </text>
        {/* Percentage — large bold */}
        <text
          x={cx} y={cy - 16}
          textAnchor="middle"
          fontSize="34"
          fontWeight="700"
          fill="#0f172a"
          fontFamily="sans-serif"
        >
          {value}%
        </text>
        {/* Progress label */}
        <text
          x={cx} y={cy + 12}
          textAnchor="middle"
          fontSize="12"
          fill="#64748b"
          fontFamily="sans-serif"
        >
          Progress
        </text>
      </svg>
    </div>
  );
}

function DisciplineDumbbell() {
  const [tip, setTip] = useState<{ label: string; value: number; y: number } | null>(null);

  const W   = 120;
  const cx  = W / 2;
  const GAP = 8;
  const R   = 5;
  const L   = 62;

  const archLabelY = 13;
  const archDotY   = archLabelY + 14;
  const blueTopY   = archDotY + R + GAP;
  const blueBotY   = blueTopY + L;
  const mgmtDotY   = blueBotY + GAP + R;
  const grayTopY   = mgmtDotY + R + GAP;
  const grayBotY   = grayTopY + L;
  const mgmtLabelY = grayBotY + GAP + 10;
  const H          = mgmtLabelY + 4;

  const tipW = 48;
  const tipH = 20;

  return (
    <div style={{ height: CHART_HEIGHT }} className="flex items-center justify-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">

        {/* Architecture label */}
        <text x={cx} y={archLabelY} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a" fontFamily="sans-serif">
          {disciplineData[0].name}
        </text>

        {/* Architecture circle */}
        <circle
          cx={cx} cy={archDotY} r={R + 4} fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setTip({ label: disciplineData[0].name, value: disciplineData[0].value, y: archDotY })}
          onMouseLeave={() => setTip(null)}
        />
        <circle cx={cx} cy={archDotY} r={R} fill="#3b82f6" style={{ pointerEvents: "none" }} />

        {/* Blue line */}
        <line x1={cx} y1={blueTopY} x2={cx} y2={blueBotY} stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" />

        {/* Management circle */}
        <circle
          cx={cx} cy={mgmtDotY} r={R + 4} fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setTip({ label: disciplineData[1].name, value: disciplineData[1].value, y: mgmtDotY })}
          onMouseLeave={() => setTip(null)}
        />
        <circle cx={cx} cy={mgmtDotY} r={R} fill="#3b82f6" style={{ pointerEvents: "none" }} />

        {/* Gray line */}
        <line x1={cx} y1={grayTopY} x2={cx} y2={grayBotY} stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />

        {/* Management label */}
        <text x={cx} y={mgmtLabelY} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a" fontFamily="sans-serif">
          {disciplineData[1].name}
        </text>

        {/* Tooltip */}
        {tip && (
          <g>
            <rect
              x={cx + R + 6} y={tip.y - tipH / 2}
              width={tipW} height={tipH} rx={4}
              fill="#1e293b"
            />
            <text
              x={cx + R + 6 + tipW / 2} y={tip.y + 4}
              textAnchor="middle" fontSize="10" fill="white" fontFamily="sans-serif"
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
      {/* Task Status , donut */}
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
        <div className="mt-1 flex justify-center gap-4 text-xs text-slate-600">
          {taskStatusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Discipline Workload — vertical dumbbell */}
      <ChartCard title="Discipline Workload" subtitle="Active tasks by discipline">
        <DisciplineDumbbell />
      </ChartCard>

      {/* Priority Breakdown , vertical bars */}
      <ChartCard title="Priority Breakdown" subtitle="Tasks by priority level">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={priorityData}
            margin={{ left: -16, right: 8, top: 4, bottom: 4 }}
          >
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={36}>
              {priorityData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Overall Completion , semicircle gauge */}
      <ChartCard title="Overall Completion" subtitle="% of tasks completed">
        <CompletionGauge value={63} />
      </ChartCard>
    </section>
  );
}
