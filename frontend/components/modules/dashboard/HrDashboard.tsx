'use client';

import Link from 'next/link';
import { Spin } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

const LEAVE_TYPE_COLORS: Record<string, string> = {
  ANNUAL: '#378ADD',
  SICK: '#D85A30',
  UNPAID: '#D3D1C7',
  MATERNITY: '#0891B2',
  PATERNITY: '#0891B2',
  EMERGENCY: '#E24B4A',
  COMPASSIONATE: '#BA7517',
};

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

  const leaveByTypeData = Object.entries(hr.leaveByType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      name: formatLeaveType(type),
      value: count,
      fill: LEAVE_TYPE_COLORS[type] ?? tokens.colorGray200,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
          sub={hr.pendingLeaveRequests > 0 ? 'awaiting approval' : 'All caught up'}
          color={hr.pendingLeaveRequests > 0 ? 'blue' : 'default'}
          icon={<ClockCircleOutlined />}
          href="/hr/leave-requests"
        />
        <StatCard
          label="Pending Overtime"
          value={hr.pendingOvertimeSheets}
          sub={hr.pendingOvertimeSheets > 0 ? 'awaiting approval' : 'All caught up'}
          color={hr.pendingOvertimeSheets > 0 ? 'blue' : 'default'}
          icon={<FieldTimeOutlined />}
          href="/hr/overtime"
        />
        <StatCard
          label="Flights Needing Ticket"
          value={hr.pendingFlightBookings}
          sub={hr.pendingFlightBookings > 0 ? 'booking required' : 'None pending'}
          color={hr.pendingFlightBookings > 0 ? 'amber' : 'default'}
          icon={<SendOutlined />}
          href="/hr/flight-applications"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Leave Requests This Month by Type"
          subtitle="Submitted, in review, or approved"
          icon={<CalendarOutlined />}
        >
          {leaveByTypeData.length === 0 ? (
            <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={leaveByTypeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {leaveByTypeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: '#5F5E5A' }}>{value}</span>
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
            <p className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={hr.overtimeThisMonth}
                layout="vertical"
                margin={{ left: 8, right: 20, top: 8, bottom: 8 }}
              >
                <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="employeeName"
                  width={120}
                  tick={CHART_AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={CHART_TOOLTIP_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="totalHours" fill="#1D9E75" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      {formatLeaveType(req.leaveType)} · {req.days}d ·{' '}
                      {formatProjectDate(req.startDate)}
                    </p>
                  </div>
                  <StatusBadge
                    label={formatLeaveStatus(req.status)}
                    variant={leaveStatusVariant(req.status)}
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Upcoming Travel" subtitle="Next 30 days" icon={<SendOutlined />}>
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
