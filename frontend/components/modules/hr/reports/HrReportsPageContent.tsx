'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Grid, Select, Skeleton, Tooltip } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  FileOutlined,
  ReloadOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ChartCard,
  StatCard,
} from '@/components/modules/dashboard/DashboardStats';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  HrReportEmployeeLeaveRow,
  HrReportEmployeeOvertimeRow,
  HrReportLeaveTypeRow,
  HrReportNamedCount,
} from '@/lib/api/reporting.types';
import { useDepartments } from '@/lib/query/org';
import { useHrReport } from '@/lib/query/hr-report';
import { buildHrReportExportSheets } from '@/lib/utils/hr-report-export';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';

const PAGE = 'pages.hr.reports';
const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * HR reports — headcount, leave, overtime, travel and contracts for a period.
 * The HR dashboard answers "right now"; this page answers "over this range".
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
      render: (value: string | null) => value || '—',
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
      render: (value: string | null) => value || '—',
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

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const emptyText = t(`${PAGE}.empty`);

  return (
    <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
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
              title={t(`${PAGE}.sections.overtimeByEmployee`)}
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
            title={t(`${PAGE}.sections.overtimeMix`)}
            subtitle={t(`${PAGE}.sections.overtimeMixSubtitle`)}
            icon={<FieldTimeOutlined />}
          >
            <div className="erp-users-stat-bar erp-dashboard-stat-bar--4">
              <StatCard
                label={t(`${PAGE}.kpi.regularHours`)}
                value={report.overtime.regularHours}
              />
              <StatCard
                label={t(`${PAGE}.kpi.nightHours`)}
                value={report.overtime.nightHours}
              />
              <StatCard
                label={t(`${PAGE}.kpi.weekendHours`)}
                value={report.overtime.weekendHours}
              />
              <StatCard
                label={t(`${PAGE}.kpi.holidayHours`)}
                value={report.overtime.holidayHours}
              />
            </div>
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}
