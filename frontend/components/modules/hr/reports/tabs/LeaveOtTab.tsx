'use client';

import { useMemo, useState } from 'react';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarDays, Timer } from 'lucide-react';
import {
  HrDonutChart,
  HrHorizontalBarChart,
  HrPieChart,
  HrVerticalBarChart,
  toChartData,
} from '@/components/modules/hr/reports/HrReportCharts';
import {
  humanizeStatus,
  PAGE,
} from '@/components/modules/hr/reports/hr-report-tabs';
import ReportSectionCard from '@/components/modules/hr/reports/ReportSectionCard';
import type { HrReportTabProps } from '@/components/modules/hr/reports/tabs/hr-report-tab-types';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  HrReportEmployeeLeaveRow,
  HrReportEmployeeOvertimeRow,
  HrReportLeaveTypeRow,
} from '@/lib/api/reporting.types';
import { formatLeaveType } from '@/lib/utils/leave-display';

type DetailTableKey = 'leaveByEmployee' | 'overtimeByEmployee';

/**
 * Leave & OT charts and detail tables.
 */
export default function LeaveOtTab({
  report,
  query,
  isCompact,
  tablesOpenByDefault,
}: HrReportTabProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const chartEmpty = t(`${PAGE}.chartEmpty`);
  const emptyText = t(`${PAGE}.empty`);
  const [tableOpen, setTableOpen] = useState<
    Partial<Record<DetailTableKey, boolean>>
  >({});

  const isTableOpen = (key: DetailTableKey): boolean =>
    tableOpen[key] ?? tablesOpenByDefault;

  const tableToggle = (key: DetailTableKey): React.ReactNode => {
    const open = isTableOpen(key);
    return (
      <Button
        type="link"
        size="small"
        aria-expanded={open}
        aria-controls={`hr-report-table-${key}`}
        onClick={() =>
          setTableOpen((current) => ({ ...current, [key]: !open }))
        }
      >
        {t(open ? `${PAGE}.hideTable` : `${PAGE}.showTable`)}
      </Button>
    );
  };

  const leaveTypeChart = useMemo(
    () =>
      toChartData(
        report.leave.byType.map((row) => ({
          name: formatLeaveType(row.leaveType, t),
          value: row.days > 0 ? row.days : row.requests,
        })),
      ),
    [report, t],
  );

  const leaveStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report.leave.byStatus).map(([name, value]) => ({
          name: humanizeStatus(name),
          value,
        })),
      ),
    [report],
  );

  const overtimeMixChart = useMemo(
    () =>
      toChartData([
        {
          name: t(`${PAGE}.kpi.regularHours`),
          value: report.overtime.regularHours,
        },
        {
          name: t(`${PAGE}.kpi.nightHours`),
          value: report.overtime.nightHours,
        },
        {
          name: t(`${PAGE}.kpi.weekendHours`),
          value: report.overtime.weekendHours,
        },
        {
          name: t(`${PAGE}.kpi.holidayHours`),
          value: report.overtime.holidayHours,
        },
      ]),
    [report, t],
  );

  const overtimeTopChart = useMemo(
    () =>
      toChartData(
        report.overtime.topEmployees.map((row) => ({
          name: row.employeeName,
          value: row.totalHours,
        })),
      ),
    [report],
  );

  const leaveTypeColumns: ColumnsType<HrReportLeaveTypeRow> = [
    {
      title: t(`${PAGE}.columns.leaveType`),
      dataIndex: 'leaveType',
      key: 'leaveType',
      render: (value: string) => formatLeaveType(value, t),
    },
    {
      title: t(`${PAGE}.columns.requests`),
      dataIndex: 'requests',
      key: 'requests',
      align: 'right',
      width: 110,
    },
    {
      title: t(`${PAGE}.columns.approvedDays`),
      dataIndex: 'days',
      key: 'days',
      align: 'right',
      width: 130,
    },
  ];

  const leaveEmployeeColumns: ColumnsType<HrReportEmployeeLeaveRow> = [
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
      title: t(`${PAGE}.columns.requests`),
      dataIndex: 'requests',
      key: 'requests',
      align: 'right',
      width: 110,
    },
    {
      title: t(`${PAGE}.columns.approvedDays`),
      dataIndex: 'days',
      key: 'days',
      align: 'right',
      width: 130,
    },
  ];

  const overtimeEmployeeColumns: ColumnsType<HrReportEmployeeOvertimeRow> = [
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
      title: t(`${PAGE}.columns.sheets`),
      dataIndex: 'sheets',
      key: 'sheets',
      align: 'right',
      width: 110,
    },
    {
      title: t(`${PAGE}.columns.approvedHours`),
      dataIndex: 'totalHours',
      key: 'totalHours',
      align: 'right',
      width: 140,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSectionCard
          title={t(`${PAGE}.sections.leaveByTypeChart`)}
          subtitle={t(`${PAGE}.sections.leaveByTypeSubtitle`)}
          icon={<CalendarDays size={18} strokeWidth={1.9} />}
          tone="info"
          query={query}
          isEmpty={leaveTypeChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrPieChart data={leaveTypeChart} emptyDescription={chartEmpty} />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.leaveByStatus`)}
          subtitle={t(`${PAGE}.sections.leaveByStatusSubtitle`)}
          icon={<CalendarDays size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={leaveStatusChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrDonutChart
            data={leaveStatusChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSectionCard
          title={t(`${PAGE}.sections.overtimeMix`)}
          subtitle={t(`${PAGE}.sections.overtimeMixSubtitle`)}
          icon={<Timer size={18} strokeWidth={1.9} />}
          tone="ok"
          query={query}
          isEmpty={overtimeMixChart.every((d) => d.value === 0)}
          emptyLabel={chartEmpty}
        >
          <HrVerticalBarChart
            data={overtimeMixChart}
            emptyDescription={chartEmpty}
          />
          {report.overtime.siteAssignmentHours > 0 ? (
            <dl
              className="m-0 mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-[13px] sm:grid-cols-3"
              aria-label={t(`${PAGE}.sections.siteBreakdown`)}
            >
              {(
                [
                  ['siteAssignmentHours', report.overtime.siteAssignmentHours],
                  [
                    'withinScheduleSite',
                    report.overtime.siteWithinScheduleHours,
                  ],
                  ['otherOvertime', report.overtime.otherHours],
                ] as const
              ).map(([key, hours]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[12px] text-slate-500">
                    {t(`${PAGE}.sections.${key}`)}
                  </dt>
                  <dd className="m-0 font-semibold tabular-nums text-slate-900">
                    {hours.toLocaleString()}h
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.overtimeByEmployee`)}
          subtitle={t(`${PAGE}.sections.topTen`)}
          icon={<Timer size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={overtimeTopChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrHorizontalBarChart
            data={overtimeTopChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
      </div>

      <ReportSectionCard
        title={t(`${PAGE}.sections.leaveByType`)}
        subtitle={t(`${PAGE}.sections.leaveByTypeSubtitle`)}
        icon={<CalendarDays size={18} strokeWidth={1.9} />}
        query={query}
        isEmpty={report.leave.byType.length === 0}
        emptyLabel={emptyText}
        flush
      >
        <DataTable<HrReportLeaveTypeRow>
          rowKey="leaveType"
          size="small"
          className="erp-pro-table erp-users-table w-full max-w-none"
          scroll={false}
          columns={leaveTypeColumns}
          dataSource={report.leave.byType}
          pagination={false}
          locale={{ emptyText }}
        />
      </ReportSectionCard>

      <ReportSectionCard
        title={t(`${PAGE}.sections.leaveByEmployee`)}
        subtitle={t(`${PAGE}.sections.topTen`)}
        icon={<CalendarDays size={18} strokeWidth={1.9} />}
        query={query}
        action={tableToggle('leaveByEmployee')}
        isEmpty={false}
        flush
      >
        <div id="hr-report-table-leaveByEmployee" className="w-full min-w-0">
          {isTableOpen('leaveByEmployee') ? (
            <DataTable<HrReportEmployeeLeaveRow>
              rowKey="employeeId"
              size="small"
              className="erp-pro-table erp-users-table w-full max-w-none"
              columns={leaveEmployeeColumns}
              dataSource={report.leave.topEmployees}
              pagination={false}
              scroll={isCompact ? { x: 520 } : false}
              locale={{ emptyText }}
            />
          ) : null}
        </div>
      </ReportSectionCard>

      <ReportSectionCard
        title={t(`${PAGE}.sections.overtimeByEmployeeTable`)}
        subtitle={t(`${PAGE}.sections.topTen`)}
        icon={<Timer size={18} strokeWidth={1.9} />}
        query={query}
        action={tableToggle('overtimeByEmployee')}
        isEmpty={false}
        flush
      >
        <div id="hr-report-table-overtimeByEmployee" className="w-full min-w-0">
          {isTableOpen('overtimeByEmployee') ? (
            <DataTable<HrReportEmployeeOvertimeRow>
              rowKey="employeeId"
              size="small"
              className="erp-pro-table erp-users-table w-full max-w-none"
              columns={overtimeEmployeeColumns}
              dataSource={report.overtime.topEmployees}
              pagination={false}
              scroll={isCompact ? { x: 520 } : false}
              locale={{ emptyText }}
            />
          ) : null}
        </div>
      </ReportSectionCard>
    </div>
  );
}
