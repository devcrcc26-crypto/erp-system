'use client';

import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  LineChart,
  Plane,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import OverviewStatCard from '@/components/modules/dashboard/home/tabs/overview/OverviewStatCard';
import { MetricStrip } from '@/components/modules/dashboard/home/tabs/TabParts';
import {
  HrDonutChart,
  HrHorizontalBarChart,
  HrLineChart,
  toChartData,
} from '@/components/modules/hr/reports/HrReportCharts';
import {
  humanizeStatus,
  NOT_SPECIFIED,
  PAGE,
} from '@/components/modules/hr/reports/hr-report-tabs';
import ReportSectionCard from '@/components/modules/hr/reports/ReportSectionCard';
import type { HrReportTabProps } from '@/components/modules/hr/reports/tabs/hr-report-tab-types';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { HrReportNamedCount } from '@/lib/api/reporting.types';

/**
 * Overview: KPI strip, headcount / workforce mix / trend, headcount table.
 */
export default function OverviewTab({
  report,
  query,
}: HrReportTabProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const chartEmpty = t(`${PAGE}.chartEmpty`);
  const emptyText = t(`${PAGE}.empty`);

  const labelEnum = (namespace: string, value: string): string => {
    if (value === NOT_SPECIFIED) {
      return t(`${PAGE}.notSpecified`);
    }
    const key = `hr.${namespace}.${value}`;
    const label = t(key);
    return label === key ? humanizeStatus(value) : label;
  };

  const headcountChart = useMemo(
    () =>
      toChartData(
        report.headcount.byDepartment.map((row) => ({
          name: row.name,
          value: row.count,
        })),
      ),
    [report],
  );

  const employeeTypeChart = useMemo(
    () =>
      toChartData(
        report.headcount.byEmployeeType.map((row) => ({
          name: labelEnum('employeeType', row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const nationalityChart = useMemo(
    () =>
      toChartData(
        report.headcount.byNationality.map((row) => ({
          name: labelEnum('nationality', row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const genderChart = useMemo(
    () =>
      toChartData(
        report.headcount.byGender.map((row) => ({
          name: labelEnum('gender', row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const headcountTrendChart = useMemo(
    () =>
      report.headcountTrend.map((row) => ({
        name: dayjs(`${row.month}-01`).format('MMM'),
        value: row.count,
      })),
    [report],
  );

  const departmentColumns: ColumnsType<HrReportNamedCount> = [
    { title: t(`${PAGE}.columns.department`), dataIndex: 'name', key: 'name' },
    {
      title: t(`${PAGE}.columns.employees`),
      dataIndex: 'count',
      key: 'count',
      align: 'right',
      width: 120,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip query={query} label={t(`${PAGE}.tabs.overview`)} columns={4}>
        <OverviewStatCard
          index={0}
          icon={Users}
          tone="info"
          label={t(`${PAGE}.kpi.activeEmployees`)}
          value={String(report.headcount.activeEmployees)}
          badge={t(`${PAGE}.kpi.newHires`, {
            count: report.headcount.newHiresInRange,
          })}
        />
        <OverviewStatCard
          index={1}
          icon={CalendarDays}
          tone="info"
          label={t(`${PAGE}.kpi.leaveRequests`)}
          value={String(report.leave.requests)}
          badge={t(`${PAGE}.kpi.approvedRequests`, {
            count: report.leave.approvedRequests,
          })}
        />
        <OverviewStatCard
          index={2}
          icon={Clock3}
          tone="warn"
          label={t(`${PAGE}.kpi.approvedLeaveDays`)}
          value={String(report.leave.approvedDays)}
        />
        <OverviewStatCard
          index={3}
          icon={Timer}
          tone="ok"
          label={t(`${PAGE}.kpi.overtimeHours`)}
          value={String(report.overtime.approvedHours)}
          badge={t(`${PAGE}.kpi.fromSheets`, {
            count: report.overtime.approvedSheets,
          })}
        />
        <OverviewStatCard
          index={4}
          icon={Plane}
          tone="info"
          label={t(`${PAGE}.kpi.travel`)}
          value={String(report.travel.flights + report.travel.businessTrips)}
          badge={t(`${PAGE}.kpi.travelSplit`, {
            flights: report.travel.flights,
            trips: report.travel.businessTrips,
          })}
        />
        <OverviewStatCard
          index={5}
          icon={FileText}
          tone={report.contracts.expiringInRange > 0 ? 'urgent' : 'neutral'}
          label={t(`${PAGE}.kpi.contractsExpiring`)}
          value={String(report.contracts.expiringInRange)}
          badge={t(`${PAGE}.kpi.activeContracts`, {
            count: report.contracts.active,
          })}
        />
        <OverviewStatCard
          index={6}
          icon={Wallet}
          tone="warn"
          label={t(`${PAGE}.kpi.expenses`)}
          value={String(report.expenses.claims)}
          badge={t(`${PAGE}.kpi.approvedAmount`, {
            amount: report.expenses.approvedAmountEtb.toLocaleString(),
          })}
        />
        <OverviewStatCard
          index={7}
          icon={ClipboardCheck}
          tone="ok"
          label={t(`${PAGE}.kpi.evaluations`)}
          value={String(report.evaluations.total)}
          badge={
            report.evaluations.averageFinalScore != null
              ? t(`${PAGE}.kpi.avgScore`, {
                  score: report.evaluations.averageFinalScore,
                })
              : t(`${PAGE}.kpi.completedEvals`, {
                  count: report.evaluations.completed,
                })
          }
        />
      </MetricStrip>

      <ReportSectionCard
        title={t(`${PAGE}.sections.headcountChart`)}
        subtitle={t(`${PAGE}.sections.headcountSubtitle`, {
          count: report.headcount.withoutDepartment,
        })}
        icon={<Users size={18} strokeWidth={1.9} />}
        tone="info"
        query={query}
        isEmpty={headcountChart.length === 0}
        emptyLabel={chartEmpty}
      >
        <HrHorizontalBarChart
          data={headcountChart}
          emptyDescription={chartEmpty}
        />
      </ReportSectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportSectionCard
          title={t(`${PAGE}.sections.byEmployeeType`)}
          subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
          icon={<Users size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={employeeTypeChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrDonutChart
            data={employeeTypeChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.byNationality`)}
          subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
          icon={<Users size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={nationalityChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrDonutChart
            data={nationalityChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.byGender`)}
          subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
          icon={<Users size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={genderChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrDonutChart data={genderChart} emptyDescription={chartEmpty} />
        </ReportSectionCard>
      </div>

      <ReportSectionCard
        title={t(`${PAGE}.sections.headcountTrend`)}
        subtitle={t(`${PAGE}.sections.headcountTrendSubtitle`)}
        icon={<LineChart size={18} strokeWidth={1.9} />}
        tone="info"
        query={query}
        isEmpty={headcountTrendChart.length === 0}
        emptyLabel={chartEmpty}
      >
        <HrLineChart
          data={headcountTrendChart}
          emptyDescription={chartEmpty}
        />
      </ReportSectionCard>

      <ReportSectionCard
        title={t(`${PAGE}.sections.headcount`)}
        subtitle={t(`${PAGE}.sections.headcountSubtitle`, {
          count: report.headcount.withoutDepartment,
        })}
        icon={<Users size={18} strokeWidth={1.9} />}
        query={query}
        isEmpty={report.headcount.byDepartment.length === 0}
        emptyLabel={emptyText}
        flush
      >
        <DataTable<HrReportNamedCount>
          rowKey="name"
          size="small"
          className="erp-pro-table erp-users-table w-full max-w-none"
          scroll={false}
          columns={departmentColumns}
          dataSource={report.headcount.byDepartment}
          pagination={false}
          locale={{ emptyText }}
        />
      </ReportSectionCard>
    </div>
  );
}
