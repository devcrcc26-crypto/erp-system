'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  FileOutlined,
  SendOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useHrDashboard } from '@/lib/query/dashboard';
import { tokens } from '@/lib/theme/tokens';
import {
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
} from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAuthStore } from '@/stores/auth.store';

const LEAVE_TYPE_COLORS: Record<string, string> = {
  ANNUAL: '#1D9E75',
  SICK: '#E24B4A',
  UNPAID: '#9CA3AF',
  MATERNITY: '#7C3AED',
  PATERNITY: '#378ADD',
  EMERGENCY: '#BA7517',
  COMPASSIONATE: '#0891B2',
};

const MODULE_COLORS: Record<string, string> = {
  'Leave Request': '#1D9E75',
  Overtime: '#378ADD',
  'Expense Claim': '#BA7517',
  'Purchase Request': '#7C3AED',
  'Business Trip': '#0891B2',
  Flight: '#E24B4A',
  'Vehicle Application': '#D85A30',
  'Per Diem': '#059669',
  'Official Seal': '#6366F1',
  'Project Seal': '#0EA5E9',
  'Inspection': '#F97316',
  Consumables: '#14B8A6',
  'Material Requisition': '#8B5CF6',
  'Vehicle Refueling': '#F59E0B',
};

const MODULE_COLOR_FALLBACK = [
  '#1D9E75',
  '#378ADD',
  '#7C3AED',
  '#BA7517',
  '#0891B2',
  '#E24B4A',
  '#059669',
  '#D85A30',
] as const;

function colorForModule(module: string, index: number): string {
  const exact = MODULE_COLORS[module];
  if (exact) {
    return exact;
  }
  const lower = module.toLowerCase();
  const matchedKey = Object.keys(MODULE_COLORS).find(
    (key) =>
      lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower),
  );
  if (matchedKey) {
    return MODULE_COLORS[matchedKey];
  }
  return MODULE_COLOR_FALLBACK[index % MODULE_COLOR_FALLBACK.length];
}

const HEADCOUNT_PALETTE = [
  '#1D9E75',
  '#378ADD',
  '#7C3AED',
  '#BA7517',
  '#0891B2',
  '#E24B4A',
  '#059669',
  '#D85A30',
] as const;

const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
} as const;

const AXIS_TICK = { fontSize: 11, fill: '#6B7280' } as const;

const HR = 'pages.dashboard.hr';

const ViewAllLink = ({
  href,
  label,
}: {
  href: string;
  label: string;
}): React.ReactNode => (
  <Link
    href={href}
    className="text-xs font-medium text-[#1D9E75] no-underline hover:text-[#0F6E56]"
  >
    {label}
  </Link>
);

function employeeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function truncateLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * HR home dashboard - leave/overtime/travel KPIs, charts, and recent activity.
 */
export default function HrDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const hrQuery = useHrDashboard(enabled);
  const hr = hrQuery.data;
  const loading = hrQuery.isLoading || hrQuery.isFetching;

  if (loading && !hr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (!hr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="erp-pro-card p-6">
          <p className="erp-users-cell-sub m-0">{t(`${HR}.loadFailed`)}</p>
        </div>
      </div>
    );
  }

  const firstName = user?.firstName ?? t(`${HR}.greeting.fallbackName`);
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t(`${HR}.greeting.morning`)
      : hour < 17
        ? t(`${HR}.greeting.afternoon`)
        : t(`${HR}.greeting.evening`);
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';
  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const leaveByTypeData = Object.entries(hr.leaveByType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      name: formatLeaveType(type, t),
      value: count,
      fill: LEAVE_TYPE_COLORS[type] ?? tokens.colorGray200,
    }));

  const leaveTrend = hr.leaveRequestsTrend ?? [];
  const pendingByModule = hr.pendingByModule ?? [];
  const headcountByDepartment = hr.headcountByDepartment ?? [];

  const leaveTypeTotal = leaveByTypeData.reduce(
    (sum, row) => sum + row.value,
    0,
  );

  const pendingTotal = pendingByModule.reduce(
    (sum, row) => sum + row.pending,
    0,
  );
  const pendingChartData = pendingByModule.map((row, index) => ({
    module: row.module,
    shortLabel: truncateLabel(row.module, 12),
    pending: row.pending,
    fill: colorForModule(row.module, index),
  }));

  const overtimeChartHeight = Math.max(
    220,
    Math.min(360, 40 + hr.overtimeThisMonth.length * 32),
  );
  const headcountChartHeight = Math.max(
    220,
    Math.min(320, 40 + headcountByDepartment.length * 36),
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
      <div className="erp-dashboard-greeting erp-pro-card">
        <p className="erp-dashboard-greeting-eyebrow m-0">
          {t(`${HR}.title`)} · {today}
        </p>
        <h1 className="erp-dashboard-greeting-title m-0">
          {greeting}, {firstName}
        </h1>
      </div>

      <div className="erp-users-stat-bar erp-dashboard-stat-bar--4">
        <StatCard
          label={t(`${HR}.kpi.employees`)}
          value={hr.totalEmployees}
          color="teal"
          icon={<TeamOutlined />}
          href="/users"
        />
        <StatCard
          label={t(`${HR}.kpi.onLeave`)}
          value={hr.onLeaveThisWeek}
          sub={t(`${HR}.kpi.thisWeek`)}
          color="amber"
          icon={<CalendarOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label={t(`${HR}.kpi.pendingLeave`)}
          value={hr.pendingLeaveRequests}
          color={hr.pendingLeaveRequests > 0 ? 'blue' : 'default'}
          icon={<ClockCircleOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label={t(`${HR}.kpi.pendingOvertime`)}
          value={hr.pendingOvertimeSheets}
          color={hr.pendingOvertimeSheets > 0 ? 'blue' : 'default'}
          icon={<FieldTimeOutlined />}
          href="/hr/overtime"
        />
      </div>

      <div className="erp-users-stat-bar erp-dashboard-stat-bar--3">
        <StatCard
          label={t(`${HR}.kpi.flightTickets`)}
          value={hr.pendingFlightBookings}
          sub={t(`${HR}.kpi.bookingRequired`)}
          color={hr.pendingFlightBookings > 0 ? 'amber' : 'default'}
          icon={<SendOutlined />}
          href="/hr/flight-applications"
        />
        <StatCard
          label={t(`${HR}.kpi.contractsExpiring`)}
          value={hr.contractsExpiringSoon ?? 0}
          sub={t(`${HR}.kpi.within90Days`)}
          color={(hr.contractsExpiringSoon ?? 0) > 0 ? 'red' : 'default'}
          icon={<FileOutlined />}
          href="/hr/employee-contract"
        />
        <StatCard
          label={t(`${HR}.kpi.noLeavePolicy`)}
          value={hr.employeesWithoutPolicy ?? 0}
          sub={
            (hr.employeesWithoutPolicy ?? 0) > 0
              ? t(`${HR}.kpi.needsAssignment`)
              : t(`${HR}.kpi.allAssigned`)
          }
          color={(hr.employeesWithoutPolicy ?? 0) > 0 ? 'amber' : 'default'}
          icon={<WarningOutlined />}
          href="/users"
        />
      </div>

      {(leaveTrend.length > 0 || leaveByTypeData.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-5">
          {leaveTrend.length > 0 ? (
            <div
              className={
                leaveByTypeData.length > 0 ? 'xl:col-span-3' : 'xl:col-span-5'
              }
            >
              <ChartCard
                title={t(`${HR}.chart.leaveTrend.title`)}
                subtitle={t(`${HR}.chart.leaveTrend.subtitle`)}
                icon={<CalendarOutlined />}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart
                    data={leaveTrend}
                    margin={{ left: 4, right: 12, top: 12, bottom: 4 }}
                    barGap={4}
                    barCategoryGap="28%"
                  >
                    <defs>
                      <linearGradient id="hrApprovedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#378ADD" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#378ADD" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="hrRejectedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E24B4A" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#E24B4A" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="hrTotalArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#1D9E75" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(0,0,0,0.05)"
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingTop: 8 }}
                      formatter={(value) => (
                        <span style={{ fontSize: 11, color: '#6B7280' }}>
                          {value}
                        </span>
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name={t(`${HR}.chart.legend.total`)}
                      stroke="#1D9E75"
                      strokeWidth={2.5}
                      fill="url(#hrTotalArea)"
                      dot={{ r: 3, fill: '#1D9E75', strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                    <Bar
                      dataKey="approved"
                      name={t(`${HR}.chart.legend.approved`)}
                      fill="url(#hrApprovedFill)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="rejected"
                      name={t(`${HR}.chart.legend.rejected`)}
                      fill="url(#hrRejectedFill)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          ) : null}

          {leaveByTypeData.length > 0 ? (
            <div
              className={
                leaveTrend.length > 0 ? 'xl:col-span-2' : 'xl:col-span-5'
              }
            >
              <ChartCard
                title={t(`${HR}.chart.leaveMix.title`)}
                subtitle={t(`${HR}.chart.leaveMix.subtitle`)}
                icon={<CalendarOutlined />}
              >
                <div className="grid grid-cols-1 gap-2 sm:h-[280px] sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="relative mx-auto w-full max-w-[260px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={leaveByTypeData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={96}
                          paddingAngle={4}
                          stroke="#fff"
                          strokeWidth={3}
                        >
                          {leaveByTypeData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value, name) => [
                            t(`${HR}.chart.requestsCount`, {
                              count: String(value),
                            }),
                            String(name),
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="m-0 text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
                        {leaveTypeTotal}
                      </p>
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                        {t(`${HR}.chart.requests`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex max-h-[280px] min-w-[140px] flex-col justify-center gap-2.5 overflow-y-auto">
                    {leaveByTypeData.map((entry) => {
                      const pct =
                        leaveTypeTotal > 0
                          ? Math.round((entry.value / leaveTypeTotal) * 100)
                          : 0;
                      return (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.fill }}
                            />
                            <span className="truncate text-xs text-[var(--color-text-secondary)]">
                              {entry.name}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ChartCard>
            </div>
          ) : null}
        </div>
      )}

      {(pendingByModule.length > 0 || headcountByDepartment.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {pendingByModule.length > 0 ? (
            <ChartCard
              title={t(`${HR}.chart.pendingApprovals.title`)}
              subtitle={t(`${HR}.chart.pendingApprovals.subtitle`, {
                total: pendingTotal,
                count: pendingByModule.length,
              })}
              icon={<ClockCircleOutlined />}
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={pendingChartData}
                  margin={{ left: 4, right: 8, top: 24, bottom: 8 }}
                  barCategoryGap="10%"
                >
                  <defs>
                    {pendingChartData.map((entry, index) => (
                      <linearGradient
                        key={entry.module}
                        id={`pendingGrad-${index}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={entry.fill}
                          stopOpacity={0.95}
                        />
                        <stop
                          offset="100%"
                          stopColor={entry.fill}
                          stopOpacity={0.55}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    stroke="rgba(0,0,0,0.05)"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="shortLabel"
                    interval={0}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    angle={-28}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as
                        | { module?: string }
                        | undefined;
                      return row?.module ?? '';
                    }}
                    formatter={(value) => [
                      t(`${HR}.chart.pendingCount`, { count: String(value) }),
                      t(`${HR}.chart.count`),
                    ]}
                  />
                  <Bar
                    dataKey="pending"
                    name={t(`${HR}.chart.pending`)}
                    radius={[8, 8, 0, 0]}
                    maxBarSize={72}
                  >
                    {pendingChartData.map((entry, index) => (
                      <Cell
                        key={entry.module}
                        fill={`url(#pendingGrad-${index})`}
                      />
                    ))}
                    <LabelList
                      dataKey="pending"
                      position="top"
                      offset={6}
                      style={{
                        fill: '#111827',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {headcountByDepartment.length > 0 ? (
            <ChartCard
              title={t(`${HR}.chart.headcount.title`)}
              subtitle={t(`${HR}.chart.headcount.subtitle`)}
              icon={<TeamOutlined />}
            >
              <ResponsiveContainer width="100%" height={headcountChartHeight}>
                <BarChart
                  data={headcountByDepartment}
                  layout="vertical"
                  margin={{ left: 8, right: 20, top: 4, bottom: 4 }}
                >
                  <defs>
                    {headcountByDepartment.map((entry, index) => {
                      const color =
                        HEADCOUNT_PALETTE[index % HEADCOUNT_PALETTE.length];
                      return (
                        <linearGradient
                          key={entry.department}
                          id={`deptGrad-${index}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0%" stopColor={color} stopOpacity={0.75} />
                          <stop offset="100%" stopColor={color} stopOpacity={1} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid
                    stroke="rgba(0,0,0,0.05)"
                    strokeDasharray="4 4"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    width={118}
                    tickFormatter={(value: string) => truncateLabel(value)}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar
                    dataKey="count"
                    name={t(`${HR}.chart.employees`)}
                    radius={[0, 8, 8, 0]}
                    maxBarSize={18}
                  >
                    {headcountByDepartment.map((entry, index) => (
                      <Cell
                        key={entry.department}
                        fill={`url(#deptGrad-${index})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}
        </div>
      )}

      {hr.overtimeThisMonth.length > 0 ? (
        <ChartCard
          title={t(`${HR}.chart.overtime.title`)}
          subtitle={t(`${HR}.chart.overtime.subtitle`)}
          icon={<FieldTimeOutlined />}
        >
          <ResponsiveContainer width="100%" height={overtimeChartHeight}>
            <BarChart
              data={hr.overtimeThisMonth}
              layout="vertical"
              margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="otBarGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#1D9E75" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="rgba(0,0,0,0.05)"
                strokeDasharray="4 4"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="employeeName"
                width={130}
                tickFormatter={(value: string) => truncateLabel(value, 16)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar
                dataKey="totalHours"
                name={t(`${HR}.chart.hours`)}
                fill="url(#otBarGrad)"
                radius={[0, 8, 8, 0]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <ChartCard
          title={t(`${HR}.recentLeave`)}
          icon={<CalendarOutlined />}
          action={
            <ViewAllLink href="/hr/leave-requests" label={t(`${HR}.viewAll`)} />
          }
        >
          {hr.recentLeaveRequests.length === 0 ? (
            <p className="erp-users-cell-sub m-0">{t(`${HR}.noRecentLeave`)}</p>
          ) : (
            <div className="divide-y divide-[#eef1f4]">
              {hr.recentLeaveRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE]">
                      <span className="text-xs font-semibold text-[#1D9E75]">
                        {employeeInitials(req.employeeName)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="erp-users-cell-strong m-0 truncate">
                        {req.employeeName}
                      </p>
                      <p className="erp-users-cell-sub m-0 mt-0.5">
                        {formatLeaveType(req.leaveType, t)} ·{' '}
                        {t(`${HR}.daysShort`, { days: req.days })} ·{' '}
                        {formatProjectDate(req.startDate)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={formatLeaveStatus(req.status, t)}
                    variant={leaveStatusVariant(req.status)}
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t(`${HR}.upcomingTravel.title`)}
          subtitle={t(`${HR}.upcomingTravel.subtitle`)}
          icon={<SendOutlined />}
        >
          {hr.upcomingTravel.length === 0 ? (
            <p className="erp-users-cell-sub m-0 py-6 text-center">
              {t(`${HR}.upcomingTravel.empty`)}
            </p>
          ) : (
            <div className="divide-y divide-[#eef1f4]">
              {hr.upcomingTravel.map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          trip.type === 'FLIGHT' ? '#378ADD' : '#1D9E75',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="erp-users-cell-strong m-0 truncate">
                        {trip.destination}
                      </p>
                      <p className="erp-users-cell-sub m-0 mt-0.5">
                        {trip.number} ·{' '}
                        {t(
                          trip.passengerCount !== 1
                            ? `${HR}.upcomingTravel.passengerCountPlural`
                            : `${HR}.upcomingTravel.passengerCount`,
                          { count: trip.passengerCount },
                        )}{' '}
                        · {formatProjectDate(trip.departureDate)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={
                      trip.type === 'FLIGHT'
                        ? t(`${HR}.upcomingTravel.flight`)
                        : t(`${HR}.upcomingTravel.businessTrip`)
                    }
                    variant={trip.type === 'FLIGHT' ? 'info' : 'default'}
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
