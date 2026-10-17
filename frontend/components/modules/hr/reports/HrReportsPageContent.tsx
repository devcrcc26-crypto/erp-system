'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Grid, Select, Skeleton, Tooltip } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  FileOutlined,
  HomeOutlined,
  ReloadOutlined,
  SendOutlined,
  SolutionOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ChartCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import {
  HrDonutChart,
  HrHorizontalBarChart,
  HrPieChart,
  HrVerticalBarChart,
  toChartData,
} from '@/components/modules/hr/reports/HrReportCharts';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  HrReportEmployeeLeaveRow,
  HrReportEmployeeOvertimeRow,
  HrReportLeaveTypeRow,
  HrReportNamedAmount,
  HrReportNamedCount,
} from '@/lib/api/reporting.types';
import { useDepartments } from '@/lib/query/org';
import { useHrReport } from '@/lib/query/hr-report';
import { buildHrReportExportSheets } from '@/lib/utils/hr-report-export';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import '@/components/modules/users/employees-v2.css';

const PAGE = 'pages.hr.reports';
const DATE_FORMAT = 'YYYY-MM-DD';

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * HR reports - workforce, leave, overtime, travel, contracts, expenses and
 * evaluations for a chosen period, with charts and exportable tables.
 */
export default function HrReportsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canViewHr = useCanViewHr();

  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('year'),
    dayjs(),
  ]);
  const [departmentId, setDepartmentId] = useState<string | undefined>(
    undefined,
  );

  const params = useMemo(
    () => ({
      from: range[0].format(DATE_FORMAT),
      to: range[1].format(DATE_FORMAT),
      departmentId,
    }),
    [range, departmentId],
  );

  const reportQuery = useHrReport(params, canViewHr);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, canViewHr);
  const report = reportQuery.data;

  const departmentOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [departmentsQuery.data],
  );

  const labelEmployeeType = (value: string): string => {
    const key = `hr.employeeType.${value}`;
    const label = t(key);
    return label === key ? humanizeStatus(value) : label;
  };
  const labelNationality = (value: string): string => {
    const key = `hr.nationality.${value}`;
    const label = t(key);
    return label === key ? humanizeStatus(value) : label;
  };
  const labelGender = (value: string): string => {
    const key = `hr.gender.${value}`;
    const label = t(key);
    return label === key ? humanizeStatus(value) : label;
  };

  const headcountChart = useMemo(
    () =>
      toChartData(
        (report?.headcount.byDepartment ?? []).map((row) => ({
          name: row.name,
          value: row.count,
        })),
      ),
    [report],
  );

  const employeeTypeChart = useMemo(
    () =>
      toChartData(
        (report?.headcount.byEmployeeType ?? []).map((row) => ({
          name: labelEmployeeType(row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const nationalityChart = useMemo(
    () =>
      toChartData(
        (report?.headcount.byNationality ?? []).map((row) => ({
          name: labelNationality(row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const genderChart = useMemo(
    () =>
      toChartData(
        (report?.headcount.byGender ?? []).map((row) => ({
          name: labelGender(row.name),
          value: row.count,
        })),
      ),
    [report, t],
  );

  const leaveTypeChart = useMemo(
    () =>
      toChartData(
        (report?.leave.byType ?? []).map((row) => ({
          name: formatLeaveType(row.leaveType, t),
          value: row.days > 0 ? row.days : row.requests,
        })),
      ),
    [report, t],
  );

  const leaveStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report?.leave.byStatus ?? {}).map(([name, value]) => ({
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
          value: report?.overtime.regularHours ?? 0,
        },
        {
          name: t(`${PAGE}.kpi.nightHours`),
          value: report?.overtime.nightHours ?? 0,
        },
        {
          name: t(`${PAGE}.kpi.weekendHours`),
          value: report?.overtime.weekendHours ?? 0,
        },
        {
          name: t(`${PAGE}.kpi.holidayHours`),
          value: report?.overtime.holidayHours ?? 0,
        },
      ]),
    [report, t],
  );

  const overtimeTopChart = useMemo(
    () =>
      toChartData(
        (report?.overtime.topEmployees ?? []).map((row) => ({
          name: row.employeeName,
          value: row.totalHours,
        })),
      ),
    [report],
  );

  const expenseStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report?.expenses.byStatus ?? {}).map(
          ([name, value]) => ({
            name: humanizeStatus(name),
            value,
          }),
        ),
      ),
    [report],
  );

  const expenseCategoryChart = useMemo(
    () =>
      toChartData(
        (report?.expenses.byCategory ?? []).map((row) => ({
          name: row.name,
          value: row.amount,
        })),
      ),
    [report],
  );

  const evaluationStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report?.evaluations.byStatus ?? {}).map(
          ([name, value]) => ({
            name: humanizeStatus(name),
            value,
          }),
        ),
      ),
    [report],
  );

  const travelMixChart = useMemo(
    () =>
      toChartData([
        {
          name: t(`${PAGE}.kpi.flights`),
          value: report?.travel.flights ?? 0,
        },
        {
          name: t(`${PAGE}.kpi.businessTrips`),
          value: report?.travel.businessTrips ?? 0,
        },
      ]),
    [report, t],
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

  const expenseCategoryColumns: ColumnsType<HrReportNamedAmount> = [
    { title: t(`${PAGE}.columns.category`), dataIndex: 'name', key: 'name' },
    {
      title: t(`${PAGE}.columns.lineItems`),
      dataIndex: 'count',
      key: 'count',
      align: 'right',
      width: 110,
    },
    {
      title: t(`${PAGE}.columns.amountEtb`),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 140,
      render: (value: number) => value.toLocaleString(),
    },
  ];

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employees-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const emptyText = t(`${PAGE}.empty`);
  const chartEmpty = t(`${PAGE}.chartEmpty`);

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page erp-employees-v2">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <div className="flex min-w-0 flex-col">
            <span className="erp-pro-card-title">{t(`${PAGE}.title`)}</span>
            <span className="erp-users-cell-sub">
              {t(`${PAGE}.description`)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                icon={<ReloadOutlined />}
                loading={reportQuery.isFetching && !reportQuery.isLoading}
                onClick={() => void reportQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'export-hr-report',
                  label: t(`${PAGE}.export`),
                  filePrefix: 'hr-report',
                  disabled: !report,
                  buildSheets: () =>
                    report ? buildHrReportExportSheets(report) : [],
                },
              ]}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <DatePicker.RangePicker
            allowClear={false}
            value={range}
            className="erp-users-filter-daterange"
            onChange={(value) => {
              const [start, end] = value ?? [];
              if (start && end) {
                setRange([start, end]);
              }
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t(`${PAGE}.allDepartments`)}
            className="erp-users-filter-select"
            loading={departmentsQuery.isLoading}
            options={departmentOptions}
            value={departmentId}
            onChange={(value: string | undefined) => setDepartmentId(value)}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          {report ? (
            <span className="erp-users-cell-sub">
              {t(`${PAGE}.generated`, {
                date: formatProjectDate(report.generatedAt),
              })}
            </span>
          ) : null}
        </div>
      </div>

      {reportQuery.isLoading && !report ? (
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : null}

      {!reportQuery.isLoading && !report ? (
        <ErpNotice tone="error" title={t(`${PAGE}.loadFailed`)} />
      ) : null}

      {report ? (
        <>
          <div className="erp-users-stat-bar erp-dashboard-stat-bar--3">
            <StatCard
              label={t(`${PAGE}.kpi.activeEmployees`)}
              value={report.headcount.activeEmployees}
              sub={t(`${PAGE}.kpi.newHires`, {
                count: report.headcount.newHiresInRange,
              })}
              color="teal"
              icon={<TeamOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.leaveRequests`)}
              value={report.leave.requests}
              sub={t(`${PAGE}.kpi.approvedRequests`, {
                count: report.leave.approvedRequests,
              })}
              color="blue"
              icon={<CalendarOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.approvedLeaveDays`)}
              value={report.leave.approvedDays}
              color="amber"
              icon={<ClockCircleOutlined />}
            />
          </div>

          <div className="erp-users-stat-bar erp-dashboard-stat-bar--3">
            <StatCard
              label={t(`${PAGE}.kpi.overtimeHours`)}
              value={report.overtime.approvedHours}
              sub={t(`${PAGE}.kpi.fromSheets`, {
                count: report.overtime.approvedSheets,
              })}
              color="green"
              icon={<FieldTimeOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.travel`)}
              value={report.travel.flights + report.travel.businessTrips}
              sub={t(`${PAGE}.kpi.travelSplit`, {
                flights: report.travel.flights,
                trips: report.travel.businessTrips,
              })}
              color="blue"
              icon={<SendOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.contractsExpiring`)}
              value={report.contracts.expiringInRange}
              sub={t(`${PAGE}.kpi.activeContracts`, {
                count: report.contracts.active,
              })}
              color={report.contracts.expiringInRange > 0 ? 'red' : 'default'}
              icon={<FileOutlined />}
            />
          </div>

          <div className="erp-users-stat-bar erp-dashboard-stat-bar--3">
            <StatCard
              label={t(`${PAGE}.kpi.siteAssignments`)}
              value={report.siteAssignments.requests}
              sub={t(`${PAGE}.kpi.approvedRequests`, {
                count: report.siteAssignments.approvedRequests,
              })}
              color="blue"
              icon={<EnvironmentOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.expenses`)}
              value={report.expenses.claims}
              sub={t(`${PAGE}.kpi.approvedAmount`, {
                amount: report.expenses.approvedAmountEtb.toLocaleString(),
              })}
              color="amber"
              icon={<WalletOutlined />}
            />
            <StatCard
              label={t(`${PAGE}.kpi.evaluations`)}
              value={report.evaluations.total}
              sub={
                report.evaluations.averageFinalScore != null
                  ? t(`${PAGE}.kpi.avgScore`, {
                      score: report.evaluations.averageFinalScore,
                    })
                  : t(`${PAGE}.kpi.completedEvals`, {
                      count: report.evaluations.completed,
                    })
              }
              color="teal"
              icon={<SolutionOutlined />}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.headcountChart`)}
              subtitle={t(`${PAGE}.sections.headcountSubtitle`, {
                count: report.headcount.withoutDepartment,
              })}
              icon={<TeamOutlined />}
            >
              <HrHorizontalBarChart
                data={headcountChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>

            <ChartCard
              title={t(`${PAGE}.sections.leaveByTypeChart`)}
              subtitle={t(`${PAGE}.sections.leaveByTypeSubtitle`)}
              icon={<CalendarOutlined />}
            >
              <HrPieChart
                data={leaveTypeChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
            <ChartCard
              title={t(`${PAGE}.sections.byEmployeeType`)}
              subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
              icon={<TeamOutlined />}
            >
              <HrDonutChart
                data={employeeTypeChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.byNationality`)}
              subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
              icon={<TeamOutlined />}
            >
              <HrDonutChart
                data={nationalityChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.byGender`)}
              subtitle={t(`${PAGE}.sections.workforceMixSubtitle`)}
              icon={<TeamOutlined />}
            >
              <HrDonutChart
                data={genderChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.leaveByStatus`)}
              subtitle={t(`${PAGE}.sections.leaveByStatusSubtitle`)}
              icon={<CalendarOutlined />}
            >
              <HrDonutChart
                data={leaveStatusChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.overtimeMix`)}
              subtitle={t(`${PAGE}.sections.overtimeMixSubtitle`)}
              icon={<FieldTimeOutlined />}
            >
              <HrVerticalBarChart
                data={overtimeMixChart}
                emptyDescription={chartEmpty}
              />
              {report.overtime.siteAssignmentHours > 0 ? (
                <dl
                  className="m-0 mt-3 grid grid-cols-1 gap-2 border-t border-[var(--color-border-tertiary)] pt-3 text-[13px] sm:grid-cols-3"
                  aria-label={t(`${PAGE}.sections.siteBreakdown`)}
                >
                  {(
                    [
                      ['siteAssignmentHours', report.overtime.siteAssignmentHours],
                      ['withinScheduleSite', report.overtime.siteWithinScheduleHours],
                      ['otherOvertime', report.overtime.otherHours],
                    ] as const
                  ).map(([key, hours]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-[12px] text-[var(--color-text-secondary)]">
                        {t(`${PAGE}.sections.${key}`)}
                      </dt>
                      <dd className="m-0 font-semibold tabular-nums">
                        {hours.toLocaleString()}h
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.overtimeByEmployee`)}
              subtitle={t(`${PAGE}.sections.topTen`)}
              icon={<FieldTimeOutlined />}
            >
              <HrHorizontalBarChart
                data={overtimeTopChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.travelMix`)}
              subtitle={t(`${PAGE}.sections.travelMixSubtitle`)}
              icon={<SendOutlined />}
            >
              <HrDonutChart
                data={travelMixChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.expenseStatus`)}
              subtitle={t(`${PAGE}.sections.expenseStatusSubtitle`)}
              icon={<WalletOutlined />}
            >
              <HrPieChart
                data={expenseStatusChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.expenseCategories`)}
              subtitle={t(`${PAGE}.sections.expenseCategoriesSubtitle`)}
              icon={<WalletOutlined />}
            >
              <HrHorizontalBarChart
                data={expenseCategoryChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.evaluationStatus`)}
              subtitle={t(`${PAGE}.sections.evaluationStatusSubtitle`)}
              icon={<SolutionOutlined />}
            >
              <HrDonutChart
                data={evaluationStatusChart}
                emptyDescription={chartEmpty}
              />
            </ChartCard>
            <ChartCard
              title={t(`${PAGE}.sections.attendanceSnapshot`)}
              subtitle={t(`${PAGE}.sections.attendanceSnapshotSubtitle`)}
              icon={<HomeOutlined />}
            >
              <div className="erp-users-stat-bar erp-dashboard-stat-bar--3">
                <StatCard
                  label={t(`${PAGE}.kpi.siteAssignments`)}
                  value={report.siteAssignments.requests}
                />
                <StatCard
                  label={t(`${PAGE}.kpi.wfhDays`)}
                  value={report.workFromHome.days}
                />
                <StatCard
                  label={t(`${PAGE}.kpi.inactiveEmployees`)}
                  value={report.headcount.inactiveEmployees}
                />
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.headcount`)}
              subtitle={t(`${PAGE}.sections.headcountSubtitle`, {
                count: report.headcount.withoutDepartment,
              })}
              icon={<TeamOutlined />}
            >
              <DataTable<HrReportNamedCount>
                rowKey="name"
                size="small"
                columns={departmentColumns}
                dataSource={report.headcount.byDepartment}
                pagination={false}
                locale={{ emptyText }}
              />
            </ChartCard>

            <ChartCard
              title={t(`${PAGE}.sections.leaveByType`)}
              subtitle={t(`${PAGE}.sections.leaveByTypeSubtitle`)}
              icon={<CalendarOutlined />}
            >
              <DataTable<HrReportLeaveTypeRow>
                rowKey="leaveType"
                size="small"
                columns={leaveTypeColumns}
                dataSource={report.leave.byType}
                pagination={false}
                locale={{ emptyText }}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <ChartCard
              title={t(`${PAGE}.sections.leaveByEmployee`)}
              subtitle={t(`${PAGE}.sections.topTen`)}
              icon={<CalendarOutlined />}
            >
              <DataTable<HrReportEmployeeLeaveRow>
                rowKey="employeeId"
                size="small"
                columns={leaveEmployeeColumns}
                dataSource={report.leave.topEmployees}
                pagination={false}
                scroll={{ x: isCompact ? 520 : undefined }}
                locale={{ emptyText }}
              />
            </ChartCard>

            <ChartCard
              title={t(`${PAGE}.sections.overtimeByEmployeeTable`)}
              subtitle={t(`${PAGE}.sections.topTen`)}
              icon={<FieldTimeOutlined />}
            >
              <DataTable<HrReportEmployeeOvertimeRow>
                rowKey="employeeId"
                size="small"
                columns={overtimeEmployeeColumns}
                dataSource={report.overtime.topEmployees}
                pagination={false}
                scroll={{ x: isCompact ? 520 : undefined }}
                locale={{ emptyText }}
              />
            </ChartCard>
          </div>

          <ChartCard
            title={t(`${PAGE}.sections.expenseCategoriesTable`)}
            subtitle={t(`${PAGE}.sections.expenseCategoriesSubtitle`)}
            icon={<WalletOutlined />}
          >
            <DataTable<HrReportNamedAmount>
              rowKey="name"
              size="small"
              columns={expenseCategoryColumns}
              dataSource={report.expenses.byCategory}
              pagination={false}
              locale={{ emptyText }}
            />
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}
