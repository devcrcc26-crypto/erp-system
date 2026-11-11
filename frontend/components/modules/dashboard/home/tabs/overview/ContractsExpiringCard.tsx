'use client';

import { useMemo } from 'react';
import { FileSignature, FileX2 } from 'lucide-react';
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
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount, formatShortDate } from '../../format';
import OverviewCard, { TonePill } from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { CHART_TEXT, CONTRACT_LEVEL_COLORS } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

interface LevelRow {
  key: keyof typeof CONTRACT_LEVEL_COLORS;
  label: string;
  value: number;
  color: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Deterministic soft tint for an avatar based on the name. */
function avatarTint(name: string): string {
  const palette = [
    'bg-emerald-50 text-emerald-700 ring-emerald-100',
    'bg-sky-50 text-sky-700 ring-sky-100',
    'bg-violet-50 text-violet-700 ring-violet-100',
    'bg-amber-50 text-amber-700 ring-amber-100',
    'bg-rose-50 text-rose-700 ring-rose-100',
    'bg-teal-50 text-teal-700 ring-teal-100',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}

function LevelTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: LevelRow }>;
  locale: string;
}): React.ReactNode {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs shadow-md">
      <p className="m-0 font-medium text-slate-700">{row.label}</p>
      <p className="m-0 mt-0.5 tabular-nums text-slate-900">
        <span className="font-semibold">{formatCount(row.value, locale)}</span>
      </p>
    </div>
  );
}

/**
 * Contracts expiring: a four-level horizontal bar (30 / 60 / 90 days / expired)
 * with a token-driven warning palette, then the five soonest-ending contracts
 * as an avatar list with an "Ends today" pill where relevant.
 */
export default function ContractsExpiringCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const contracts = stats?.contractsExpiring ?? null;
  const list = stats?.contractsExpiringSoonList ?? [];

  const rows = useMemo<LevelRow[]>(() => {
    if (!contracts) return [];
    return [
      {
        key: 'within30',
        label: t(`${STATS}.contracts.within30`),
        value: contracts.within30,
        color: CONTRACT_LEVEL_COLORS.within30,
      },
      {
        key: 'within60',
        label: t(`${STATS}.contracts.within60`),
        value: contracts.within60,
        color: CONTRACT_LEVEL_COLORS.within60,
      },
      {
        key: 'within90',
        label: t(`${STATS}.contracts.within90`),
        value: contracts.within90,
        color: CONTRACT_LEVEL_COLORS.within90,
      },
      {
        key: 'expired',
        label: t(`${STATS}.contracts.expired`),
        value: contracts.expiredUnrenewed,
        color: CONTRACT_LEVEL_COLORS.expired,
      },
    ];
  }, [contracts, t]);

  const hasChart = rows.some((row) => row.value > 0);
  const isEmpty = !contracts || (!hasChart && list.length === 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <OverviewCard
      title={t(`${HOME}.contracts.title`)}
      subtitle={t(`${HOME}.overview.contractsSubtitle`)}
      icon={<FileSignature size={18} strokeWidth={1.9} />}
      tone={contracts && contracts.within30 > 0 ? 'urgent' : 'warn'}
      viewAllHref="/hr/employee-contract"
      query={query}
      isEmpty={isEmpty}
      emptyState={
        <OverviewEmptyState
          icon={FileX2}
          title={t(`${HOME}.contracts.empty`)}
          description={t(`${HOME}.overview.contractsEmptyHint`)}
        />
      }
    >
      {/* Chart */}
      {hasChart ? (
        <div
          className="relative h-[168px] w-full"
          role="img"
          aria-label={rows.map((row) => `${row.label}: ${row.value}`).join(', ')}
        >
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
                width={128}
                tickLine={false}
                axisLine={false}
                tick={{ fill: CHART_TEXT, fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }}
                content={<LevelTooltip locale={locale} />}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18} isAnimationActive>
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.color} />
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
            <caption>{t(`${HOME}.contracts.title`)}</caption>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <OverviewEmptyState
          icon={FileX2}
          title={t(`${HOME}.contracts.empty`)}
          compact
        />
      )}

      {/* Legend row */}
      {hasChart ? (
        <ul className="m-0 flex flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs text-slate-500">
          {rows.map((row) => (
            <li key={row.key} className="inline-flex list-none items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span>{row.label}</span>
              <span className="font-semibold tabular-nums text-slate-700">
                {formatCount(row.value, locale)}
              </span>
            </li>
          ))}
          <li className="ml-auto inline-flex list-none items-center gap-1 text-slate-500">
            {t(`${HOME}.overview.total`)}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatCount(total, locale)}
            </span>
          </li>
        </ul>
      ) : null}

      {/* Soonest list */}
      {list.length > 0 ? (
        <div className="mt-auto border-t border-slate-100 pt-4">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {t(`${HOME}.overview.soonestToEnd`)}
          </p>
          <ul className="m-0 flex flex-col p-0">
            {list.map((contract) => (
              <li
                key={`${contract.employeeId}-${contract.endDate}`}
                className="flex list-none items-center gap-3 border-b border-slate-100 py-2.5 last:border-b-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-inset ${avatarTint(
                    contract.employeeName,
                  )}`}
                >
                  {initials(contract.employeeName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-slate-900">
                    {contract.employeeName}
                  </p>
                  <p className="m-0 truncate text-xs tabular-nums text-slate-500">
                    {formatShortDate(contract.endDate, locale)}
                  </p>
                </div>
                {contract.endsToday ? (
                  <TonePill tone="urgent">{t(`${HOME}.contracts.endsToday`)}</TonePill>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </OverviewCard>
  );
}
