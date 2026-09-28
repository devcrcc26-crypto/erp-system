'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import {
  getQuarterLabel,
  getScoreColor,
} from '@/lib/utils/evaluation-status';

interface EvaluationTrendChartProps {
  evaluations: EmployeeEvaluation[];
}

interface TrendPoint {
  label: string;
  score: number;
}

export default function EvaluationTrendChart({
  evaluations,
}: EvaluationTrendChartProps): React.ReactNode {
  const data = useMemo((): TrendPoint[] => {
    return [...evaluations]
      .sort((a, b) => {
        if (a.cycle.year !== b.cycle.year) {
          return a.cycle.year - b.cycle.year;
        }
        return a.cycle.quarter - b.cycle.quarter;
      })
      .map((ev) => {
        const raw = ev.adjustedScore ?? ev.finalScore;
        return {
          label: getQuarterLabel(ev.cycle.quarter, ev.cycle.year),
          score: raw == null ? null : Number(raw),
        };
      })
      .filter((d): d is TrendPoint => d.score !== null && Number.isFinite(d.score));
  }, [evaluations]);

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 13,
        }}
      >
        No completed evaluations yet
      </div>
    );
  }

  const trend =
    data.length >= 2
      ? data[data.length - 1].score - data[0].score
      : 0;

  const avgScore =
    data.reduce((sum, d) => sum + (d.score ?? 0), 0) / data.length;

  const trendLabel =
    trend > 0.2 && avgScore >= 4.0
      ? '🌟 Consistently Excellent'
      : trend > 0.2
        ? '📈 Improving'
        : trend < -0.2
          ? '📉 Declining'
          : avgScore >= 4.0
            ? '⭐ Consistently High'
            : avgScore >= 3.0
              ? '✅ Consistently Meeting Expectations'
              : '⚠ Needs Attention';

  const latestScore = data[data.length - 1]?.score ?? 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          {trendLabel}
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: 20,
            color: getScoreColor(latestScore),
          }}
        >
          {latestScore.toFixed(1)}
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: 'var(--color-text-tertiary)',
              marginLeft: 4,
            }}
          >
            latest
          </span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            stroke="var(--color-border)"
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 11 }}
            stroke="var(--color-border)"
          />
          <Tooltip
            formatter={(value) => [
              typeof value === 'number' ? value.toFixed(1) : String(value),
              'Score',
            ]}
            contentStyle={{
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={3}
            stroke="#faad14"
            strokeDasharray="4 4"
            label={{
              value: 'Meets Expectations',
              fontSize: 10,
              fill: '#faad14',
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#1677ff"
            strokeWidth={2}
            dot={{ r: 4, fill: '#1677ff' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
