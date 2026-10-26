'use client';

import { useMemo, useState } from 'react';
import { Segmented } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  CalendarClock,
  Home,
  MapPin,
  UserX,
} from 'lucide-react';
import OverviewStatCard from '@/components/modules/dashboard/home/tabs/overview/OverviewStatCard';
import { MetricStrip } from '@/components/modules/dashboard/home/tabs/TabParts';
import {
  HrHorizontalBarChart,
  HrVerticalBarChart,
  type HrChartDatum,
} from '@/components/modules/hr/reports/HrReportCharts';
import {
  formatPercent,
  PAGE,
} from '@/components/modules/hr/reports/hr-report-tabs';
import ReportSectionCard from '@/components/modules/hr/reports/ReportSectionCard';
import type { HrReportTabProps } from '@/components/modules/hr/reports/tabs/hr-report-tab-types';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { HrReportExpiringContractRow } from '@/lib/api/reporting.types';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';

const CONTRACT_MONTH_COLORS = [
  tokens.colorRed400,
  tokens.colorCoral400,
  tokens.colorAmber400,
] as const;

function attendanceRateColor(rate: number): string {
  if (rate >= 90) return tokens.colorGreen400;
  if (rate >= 75) return tokens.colorCoral400;
  return tokens.colorRed400;
}

/**
 * Contracts timeline / list and attendance snapshot.
 */
export default function ContractsAttendanceTab({
  report,
  query,
  isCompact,
}: HrReportTabProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const chartEmpty = t(`${PAGE}.chartEmpty`);
  const [contractMonth, setContractMonth] = useState<string | null>(null);

  const contractMonthLabel = (month: string): string =>
    dayjs(`${month}-01`).format('MMM YYYY');

  const contractTimelineChart = useMemo<HrChartDatum[]>(
    () =>
      report.contractsByMonth.map((row, index) => ({
        name: contractMonthLabel(row.month),
        value: row.count,
        color:
          CONTRACT_MONTH_COLORS[index] ??
          CONTRACT_MONTH_COLORS[CONTRACT_MONTH_COLORS.length - 1],
      })),
    [report],
  );

  const filteredExpiringContracts = useMemo(
    () =>
      report.expiringContracts.filter(
        (row) => !contractMonth || row.month === contractMonth,
      ),
    [report, contractMonth],
  );

  const toggleContractMonth = (month: string): void =>
    setContractMonth((current) => (current === month ? null : month));

  const attendanceDepartmentChart = useMemo<HrChartDatum[]>(
    () =>
      report.attendance.byDepartment.map((row) => ({
        name: row.department,
        value: row.attendanceRate,
        color: attendanceRateColor(row.attendanceRate),
      })),
    [report],
  );

  const attendanceRateTone =
    report.attendance.records === 0
      ? 'neutral'
      : report.attendance.averageAttendanceRate >= 90
        ? 'ok'
        : report.attendance.averageAttendanceRate >= 75
          ? 'warn'
          : 'urgent';

  const expiringContractColumns: ColumnsType<HrReportExpiringContractRow> = [
    {
      title: t(`${PAGE}.columns.employee`),
      dataIndex: 'employeeName',
      key: 'employeeName',
    },
    {
      title: t(`${PAGE}.columns.department`),
      dataIndex: 'department',
      key: 'department',
      render: (value: string | null) => value || '-',
    },
    {
      title: t(`${PAGE}.columns.contractNumber`),
      dataIndex: 'contractNumber',
      key: 'contractNumber',
      width: 120,
    },
    {
      title: t(`${PAGE}.columns.endDate`),
      dataIndex: 'endDate',
      key: 'endDate',
      width: 130,
      render: (value: string) => formatProjectDate(value),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ReportSectionCard
        title={t(`${PAGE}.sections.contractTimeline`)}
        subtitle={t(`${PAGE}.sections.contractTimelineSubtitle`)}
        icon={<CalendarClock size={18} strokeWidth={1.9} />}
        tone={report.contracts.expiringInRange > 0 ? 'urgent' : 'neutral'}
        query={query}
        isEmpty={contractTimelineChart.every((d) => d.value === 0)}
        emptyLabel={t(`${PAGE}.sections.noExpiringContracts`)}
      >
        <HrVerticalBarChart
          data={contractTimelineChart}
          emptyDescription={t(`${PAGE}.sections.noExpiringContracts`)}
          selectedName={
            contractMonth ? contractMonthLabel(contractMonth) : null
          }
          onSelect={(name) => {
            const row = report.contractsByMonth.find(
              (entry) => contractMonthLabel(entry.month) === name,
            );
            if (row) toggleContractMonth(row.month);
          }}
        />
      </ReportSectionCard>

      <ReportSectionCard
        title={t(`${PAGE}.sections.expiringContracts`)}
        subtitle={t(`${PAGE}.sections.expiringContractsSubtitle`, {
          count: filteredExpiringContracts.length,
        })}
        icon={<CalendarClock size={18} strokeWidth={1.9} />}
        query={query}
        isEmpty={false}
        flush
        action={
          <Segmented
            size="small"
            aria-label={t(`${PAGE}.sections.contractMonthFilter`)}
            value={contractMonth ?? ''}
            onChange={(value) =>
              setContractMonth(value ? String(value) : null)
            }
            options={[
              { value: '', label: t(`${PAGE}.allMonths`) },
              ...report.contractsByMonth.map((row) => ({
                value: row.month,
                label: `${dayjs(`${row.month}-01`).format('MMM')} (${row.count})`,
              })),
            ]}
          />
        }
      >
        <DataTable<HrReportExpiringContractRow>
          rowKey="contractId"
          size="small"
          className="erp-pro-table erp-users-table w-full max-w-none"
          columns={expiringContractColumns}
          dataSource={filteredExpiringContracts}
          pagination={{
            pageSize: 6,
            size: 'small',
            hideOnSinglePage: true,
          }}
          scroll={isCompact ? { x: 520 } : false}
          locale={{ emptyText: t(`${PAGE}.sections.noExpiringContracts`) }}
        />
      </ReportSectionCard>

      <MetricStrip
        query={query}
        label={t(`${PAGE}.sections.attendanceSnapshot`)}
        columns={3}
      >
        <OverviewStatCard
          index={0}
          icon={MapPin}
          tone="info"
          label={t(`${PAGE}.kpi.siteAssignments`)}
          value={String(report.siteAssignments.requests)}
          badge={t(`${PAGE}.kpi.approvedRequests`, {
            count: report.siteAssignments.approvedRequests,
          })}
        />
        <OverviewStatCard
          index={1}
          icon={Home}
          tone="neutral"
          label={t(`${PAGE}.kpi.wfhDays`)}
          value={String(report.workFromHome.days)}
        />
        <OverviewStatCard
          index={2}
          icon={UserX}
          tone={
            report.headcount.inactiveEmployees > 0 ? 'warn' : 'neutral'
          }
          label={t(`${PAGE}.kpi.inactiveEmployees`)}
          value={String(report.headcount.inactiveEmployees)}
        />
      </MetricStrip>

      <MetricStrip
        query={query}
        label={t(`${PAGE}.tabs.contractsAttendance`)}
        columns={4}
      >
        <OverviewStatCard
          index={0}
          icon={CalendarClock}
          tone="info"
          label={t(`${PAGE}.kpi.workingDays`)}
          value={String(report.attendance.totalWorkingDays)}
          badge={t(`${PAGE}.kpi.attendanceRecords`, {
            count: report.attendance.records,
          })}
        />
        <OverviewStatCard
          index={1}
          icon={CalendarClock}
          tone={attendanceRateTone}
          valueTone={attendanceRateTone}
          label={t(`${PAGE}.kpi.attendanceRate`)}
          value={`${report.attendance.averageAttendanceRate}%`}
        />
        <OverviewStatCard
          index={2}
          icon={CalendarClock}
          tone={
            report.attendance.totalAbsentDays > 0 ? 'urgent' : 'neutral'
          }
          label={t(`${PAGE}.kpi.absentDays`)}
          value={String(report.attendance.totalAbsentDays)}
        />
        <OverviewStatCard
          index={3}
          icon={CalendarClock}
          tone="warn"
          label={t(`${PAGE}.kpi.unpaidLeaveDays`)}
          value={String(report.attendance.totalUnpaidLeaveDays)}
        />
      </MetricStrip>

      <ReportSectionCard
        title={t(`${PAGE}.sections.attendanceByDepartment`)}
        subtitle={t(`${PAGE}.sections.attendanceByDepartmentSubtitle`)}
        icon={<CalendarClock size={18} strokeWidth={1.9} />}
        tone="info"
        query={query}
        isEmpty={attendanceDepartmentChart.length === 0}
        emptyLabel={chartEmpty}
      >
        <HrHorizontalBarChart
          data={attendanceDepartmentChart}
          emptyDescription={chartEmpty}
          valueFormatter={formatPercent}
          maxValue={100}
        />
      </ReportSectionCard>
    </div>
  );
}
