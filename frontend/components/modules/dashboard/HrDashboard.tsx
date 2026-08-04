'use client';

import { Spin } from 'antd';
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
import {
  ChartCard,
  SectionCard,
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
  ANNUAL: tokens.colorBlue400,
  SICK: tokens.colorCoral400,
  UNPAID: tokens.colorGray200,
  MATERNITY: tokens.colorCyan400,
  PATERNITY: tokens.colorCyan400,
  EMERGENCY: tokens.colorRed400,
  COMPASSIONATE: tokens.colorAmber400,
};

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
          href="/users"
        />
        <StatCard
          label="On Leave This Week"
          value={hr.onLeaveThisWeek}
          color="amber"
          href="/hr/leave-requests"
        />
        <StatCard
          label="Pending Leave"
          value={hr.pendingLeaveRequests}
          color={hr.pendingLeaveRequests > 0 ? 'blue' : 'default'}
          href="/hr/leave-requests"
        />
        <StatCard
          label="Pending Overtime"
          value={hr.pendingOvertimeSheets}
          color={hr.pendingOvertimeSheets > 0 ? 'blue' : 'default'}
          href="/hr/overtime"
        />
        <StatCard
          label="Flights Needing Ticket"
          value={hr.pendingFlightBookings}
          color={hr.pendingFlightBookings > 0 ? 'amber' : 'default'}
          href="/hr/flight-applications"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Leave Requests This Month by Type">
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
                >
                  {leaveByTypeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Overtime Hours This Month (Top 10)">
          {hr.overtimeThisMonth.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-tertiary)] m-0">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hr.overtimeThisMonth} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="employeeName"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="totalHours" fill={tokens.colorTeal400} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Recent Leave Requests"
          action={{ label: 'View all', href: '/hr/leave-requests' }}
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
        </SectionCard>

        <SectionCard title="Upcoming Travel (Next 30 Days)">
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
        </SectionCard>
      </div>
    </div>
  );
}
