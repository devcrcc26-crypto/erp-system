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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import {
  CHART_AXIS_STYLE,
  CHART_GRID_COLOR,
  CHART_TOOLTIP_CURSOR,
  CHART_TOOLTIP_STYLE,
  ChartCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useHrDashboard } from '@/lib/query/dashboard';
import { layout } from '@/lib/theme/layout';
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
  ANNUAL: '#378ADD',
  SICK: '#D85A30',
  UNPAID: '#D3D1C7',
  MATERNITY: '#0891B2',
  PATERNITY: '#0891B2',
  EMERGENCY: '#E24B4A',
  COMPASSIONATE: '#BA7517',
};

const OVERTIME_BAR_COLORS = ['#1D9E75', '#378ADD', '#BA7517'] as const;

const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 8,
  fontSize: 12,
} as const;

const ViewAllLink = ({ href }: { href: string }): React.ReactNode => (
  <Link
    href={href}
    className="text-xs text-[#1D9E75] hover:text-[#0F6E56] font-medium no-underline"
  >
    View all →
  </Link>
);

/**
 * HR home dashboard — leave/overtime/travel KPIs, charts, and recent activity.
 */
export default function HrDashboard({
  enabled = true,
}: {
  enabled?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const hrQuery = useHrDashboard(enabled);
  const hr = hrQuery.data;
  const loading = hrQuery.isLoading || hrQuery.isFetching;

  if (loading && !hr) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (!hr) {
    return (
      <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
        <p className="text-sm text-[var(--color-text-tertiary)] m-0">
          Unable to load HR dashboard.
        </p>
      </div>
    );
  }

  const firstName = user?.firstName ?? 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const alerts = [
    {
      label: `${hr.pendingLeaveRequests} pending leave`,
      href: '/hr/leave-requests',
      show: hr.pendingLeaveRequests > 0,
    },
    {
      label: `${hr.pendingOvertimeSheets} pending overtime`,
      href: '/hr/overtime',
      show: hr.pendingOvertimeSheets > 0,
    },
    {
      label: `${hr.pendingFlightBookings} flights need tickets`,
      href: '/hr/flight-applications',
      show: hr.pendingFlightBookings > 0,
    },
    {
      label: `${hr.contractsExpiringSoon} contracts expiring`,
      href: '/hr/employee-contracts',
      show: (hr.contractsExpiringSoon ?? 0) > 0,
    },
  ].filter((a) => a.show);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Greeting header */}
      <div className="mb-1">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="m-0 text-xl font-semibold text-[var(--color-text-primary)]">
              {greeting}, {firstName} 👋
            </h1>
            <p className="m-0 mt-0.5 text-sm text-[var(--color-text-tertiary)]">
              HR Dashboard · {today}
            </p>
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={hr.totalEmployees}
          color="teal"
          icon={<TeamOutlined />}
          href="/users"
        />
        <StatCard
          label="On Leave This Week"
          value={hr.onLeaveThisWeek}
          color="amber"
          icon={<CalendarOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label="Pending Leave"
          value={hr.pendingLeaveRequests}
          sub={
            hr.pendingLeaveRequests > 0 ? 'awaiting approval' : 'All caught up'
          }
          color={hr.pendingLeaveRequests > 0 ? 'blue' : 'default'}
          icon={<ClockCircleOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label="Pending Overtime"
          value={hr.pendingOvertimeSheets}
          sub={
            hr.pendingOvertimeSheets > 0 ? 'awaiting approval' : 'All caught up'
          }
          color={hr.pendingOvertimeSheets > 0 ? 'blue' : 'default'}
          icon={<FieldTimeOutlined />}
          href="/hr/overtime"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="Flights Needing Ticket"
          value={hr.pendingFlightBookings}
          sub={
            hr.pendingFlightBookings > 0 ? 'booking required' : 'None pending'
          }
          color={hr.pendingFlightBookings > 0 ? 'amber' : 'default'}
          icon={<SendOutlined />}
          href="/hr/flight-applications"
        />
        <StatCard
          label="Contracts Expiring"
          value={hr.contractsExpiringSoon ?? 0}
          sub="within 90 days"
          color={(hr.contractsExpiringSoon ?? 0) > 0 ? 'red' : 'default'}
          icon={<FileOutlined />}
          href="/hr/employee-contract"
        />
        <StatCard
          label="No Leave Policy"
          value={hr.employeesWithoutPolicy ?? 0}
          sub={
            (hr.employeesWithoutPolicy ?? 0) > 0
              ? 'needs attention'
              : 'All assigned'
          }
          color={(hr.employeesWithoutPolicy ?? 0) > 0 ? 'amber' : 'default'}
          icon={<WarningOutlined />}
          href="/users"
        />
      </div>

      <ChartCard
        title="Leave Requests — Last 6 Months"
        subtitle="Total, approved, and rejected"
        icon={<CalendarOutlined />}
      >
        {leaveTrend.length === 0 ? (
          <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
            No data
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={leaveTrend}
              margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
            >
              <CartesianGrid
                stroke="#E8E6E0"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#5F5E5A' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#5F5E5A' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#5F5E5A' }}>{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#1D9E75"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Total"
              />
              <Line
                type="monotone"
                dataKey="approved"
                stroke="#378ADD"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Approved"
              />
              <Line
                type="monotone"
                dataKey="rejected"
                stroke="#E24B4A"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Rejected"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Pending Approvals by Module"
          subtitle="Submitted or in review"
          icon={<ClockCircleOutlined />}
        >
          {pendingByModule.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No pending approvals
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={pendingByModule}
                layout="vertical"
                margin={{ left: 16, right: 24, top: 8, bottom: 8 }}
              >
                <CartesianGrid
                  stroke="#E8E6E0"
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="module"
                  width={110}
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar
                  dataKey="pending"
                  fill="#1D9E75"
                  radius={[0, 6, 6, 0]}
                  name="Pending"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Headcount by Department"
          subtitle="Active employees"
          icon={<TeamOutlined />}
        >
          {headcountByDepartment.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No department data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={headcountByDepartment}
                margin={{ left: 0, right: 16, top: 8, bottom: 40 }}
              >
                <CartesianGrid
                  stroke="#E8E6E0"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="department"
                  tick={{ fontSize: 10, fill: '#5F5E5A' }}
                  axisLine={false}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#5F5E5A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar
                  dataKey="count"
                  fill="#378ADD"
                  radius={[6, 6, 0, 0]}
                  name="Employees"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Leave Requests This Month by Type"
          subtitle="Submitted, in review, or approved"
          icon={<CalendarOutlined />}
        >
          {leaveByTypeData.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={leaveByTypeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {leaveByTypeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    `${String(value)} requests`,
                    String(name),
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: '#5F5E5A' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Overtime Hours This Month"
          subtitle="Top 10 employees"
          icon={<FieldTimeOutlined />}
        >
          {hr.overtimeThisMonth.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={hr.overtimeThisMonth}
                layout="vertical"
                margin={{ left: 8, right: 20, top: 8, bottom: 8 }}
              >
                <CartesianGrid
                  stroke={CHART_GRID_COLOR}
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={CHART_AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="employeeName"
                  width={120}
                  tick={CHART_AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={CHART_TOOLTIP_CURSOR}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Bar dataKey="totalHours" radius={[0, 6, 6, 0]} name="Hours">
                  {hr.overtimeThisMonth.map((_, index) => (
                    <Cell
                      key={`overtime-${index}`}
                      fill={
                        OVERTIME_BAR_COLORS[index] ??
                        OVERTIME_BAR_COLORS[OVERTIME_BAR_COLORS.length - 1]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Recent Leave Requests"
          icon={<CalendarOutlined />}
          action={<ViewAllLink href="/hr/leave-requests" />}
        >
          {hr.recentLeaveRequests.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] m-0">
              No leave requests yet.
            </p>
          ) : (
            <div className="divide-y divide-[rgba(0,0,0,0.06)]">
              {hr.recentLeaveRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate m-0">
                      {req.employeeName}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] m-0 mt-0.5">
                      {formatLeaveType(req.leaveType, t)} · {req.days}d ·{' '}
                      {formatProjectDate(req.startDate)}
                    </p>
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
          title="Upcoming Travel"
          subtitle="Next 30 days"
          icon={<SendOutlined />}
        >
          {hr.upcomingTravel.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center m-0">
              No upcoming travel
            </p>
          ) : (
            <div className="divide-y divide-[rgba(0,0,0,0.06)]">
              {hr.upcomingTravel.map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate m-0">
                      {trip.destination}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] m-0 mt-0.5">
                      {trip.number} · {trip.passengerCount} passenger
                      {trip.passengerCount !== 1 ? 's' : ''} ·{' '}
                      {formatProjectDate(trip.departureDate)}
                    </p>
                  </div>
                  <StatusBadge
                    label={trip.type === 'FLIGHT' ? 'Flight' : 'Business Trip'}
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
