'use client';

import { useMemo } from 'react';
import { CalendarDays, CalendarOff } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import { formatLeaveType } from '@/lib/utils/leave-display';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { LEAVE_PALETTE, TONE, type OverviewTone } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function MiniStat({
  label,
  value,
  tone,
  locale,
  large = false,
}: {
  label: string;
  value: number;
  tone?: OverviewTone;
  locale: string;
  large?: boolean;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={`m-0 mt-1 font-semibold leading-none tracking-tight tabular-nums ${
          large ? 'text-[28px]' : 'text-xl'
        } ${tone ? TONE[tone].value : 'text-slate-900'}`}
      >
        {formatCount(value, locale)}
      </p>
    </div>
  );
}

function SliceTooltip({
  active,
  payload,
  locale,
  total,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: Slice }>;
  locale: string;
  total: number;
}): React.ReactNode {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs shadow-md">
      <p className="m-0 flex items-center gap-1.5 font-medium text-slate-700">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
        {row.label}
      </p>
      <p className="m-0 mt-0.5 tabular-nums text-slate-900">
        <span className="font-semibold">{formatCount(row.value, locale)}</span>
        <span className="text-slate-400"> · {pct}%</span>
      </p>
    </div>
  );
}

/**
 * Leave summary: pending / on-leave / this-month figures, then a donut of this
 * month's requests by type with the total centred in the hollow and a tidy
 * legend beneath.
 */
export default function LeaveSummaryCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const leave = stats?.leave ?? null;

  const slices = useMemo<Slice[]>(
    () =>
      (stats?.leaveByType ?? [])
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((row, i) => ({
          key: row.type,
          label: formatLeaveType(row.type, t),
          value: row.count,
          color: LEAVE_PALETTE[i % LEAVE_PALETTE.length] ?? LEAVE_PALETTE[0]!,
        })),
    [stats?.leaveByType, t],
  );
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const pending = leave?.pendingApprovalCount ?? 0;

  return (
    <OverviewCard
      title={t(`${STATS}.leave.title`)}
      subtitle={t(`${HOME}.overview.leaveByType`)}
      icon={<CalendarDays size={18} strokeWidth={1.9} />}
      tone={pending > 0 ? 'urgent' : 'ok'}
      viewAllHref="/hr/leave-requests"
      query={query}
      isEmpty={!leave}
      emptyState={
        <OverviewEmptyState icon={CalendarOff} title={t(`${HOME}.overview.noLeaveByType`)} />
      }
    >
      {leave ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MiniStat
              label={t(`${STATS}.leave.pending`)}
              value={leave.pendingApprovalCount}
              tone={pending > 0 ? 'urgent' : undefined}
              locale={locale}
              large
            />
            <MiniStat
              label={t(`${STATS}.leave.onLeave`)}
              value={leave.currentlyOnLeave}
              locale={locale}
            />
            <MiniStat
              label={t(`${STATS}.leave.thisMonth`)}
              value={leave.thisMonthRequests}
              locale={locale}
            />
          </div>

          <div className="mt-1 border-t border-slate-100 pt-4">
            {slices.length === 0 ? (
              <OverviewEmptyState
                icon={CalendarOff}
                title={t(`${HOME}.overview.noLeaveByType`)}
                compact
              />
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div
                  className="relative h-[164px] w-[164px] shrink-0"
                  role="img"
                  aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(', ')}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<SliceTooltip locale={locale} total={total} />} />
                      <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={58}
                        outerRadius={78}
                        paddingAngle={slices.length > 1 ? 2 : 0}
                        cornerRadius={4}
                        stroke="none"
                        isAnimationActive
                      >
                        {slices.map((s) => (
                          <Cell key={s.key} fill={s.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Centred summary */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
                      {formatCount(total, locale)}
                    </span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {t(`${HOME}.overview.requests`)}
                    </span>
                  </div>
                  <table className="sr-only">
                    <caption>{t(`${HOME}.overview.leaveByType`)}</caption>
                    <tbody>
                      {slices.map((s) => (
                        <tr key={s.key}>
                          <th scope="row">{s.label}</th>
                          <td>{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="m-0 grid w-full flex-1 grid-cols-1 gap-y-2 p-0 sm:grid-cols-1">
                  {slices.map((s) => {
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                    return (
                      <li
                        key={s.key}
                        className="flex list-none items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="truncate text-slate-700">{s.label}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {formatCount(s.value, locale)}
                          </span>
                          <span className="w-9 text-right text-xs text-slate-400">{pct}%</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </>
      ) : null}
    </OverviewCard>
  );
}
