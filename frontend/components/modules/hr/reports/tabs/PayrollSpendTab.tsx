'use client';

import { useMemo, useState } from 'react';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Banknote,
  ClipboardCheck,
  Plane,
  Wallet,
} from 'lucide-react';
import OverviewStatCard from '@/components/modules/dashboard/home/tabs/overview/OverviewStatCard';
import { MetricStrip } from '@/components/modules/dashboard/home/tabs/TabParts';
import {
  HrDonutChart,
  HrHorizontalBarChart,
  HrPieChart,
  toChartData,
} from '@/components/modules/hr/reports/HrReportCharts';
import {
  formatEtbCompact,
  humanizeStatus,
  PAGE,
} from '@/components/modules/hr/reports/hr-report-tabs';
import ReportSectionCard from '@/components/modules/hr/reports/ReportSectionCard';
import type { HrReportTabProps } from '@/components/modules/hr/reports/tabs/hr-report-tab-types';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { HrReportNamedAmount } from '@/lib/api/reporting.types';

/**
 * Payroll KPIs/charts plus travel, expenses and evaluations.
 */
export default function PayrollSpendTab({
  report,
  query,
  tablesOpenByDefault,
}: HrReportTabProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const chartEmpty = t(`${PAGE}.chartEmpty`);
  const emptyText = t(`${PAGE}.empty`);
  const [expenseTableOpen, setExpenseTableOpen] = useState<boolean | null>(
    null,
  );
  const showExpenseTable = expenseTableOpen ?? tablesOpenByDefault;

  const travelMixChart = useMemo(
    () =>
      toChartData([
        {
          name: t(`${PAGE}.kpi.flights`),
          value: report.travel.flights,
        },
        {
          name: t(`${PAGE}.kpi.businessTrips`),
          value: report.travel.businessTrips,
        },
      ]),
    [report, t],
  );

  const payrollDepartmentChart = useMemo(
    () =>
      toChartData(
        report.payroll.byDepartment.map((row) => ({
          name: row.department,
          value: row.totalNet,
        })),
      ),
    [report],
  );

  const payrollStatusChart = useMemo(
    () =>
      toChartData(
        report.payroll.byStatus.map((row) => ({
          name: humanizeStatus(row.status),
          value: row.count,
        })),
      ),
    [report],
  );

  const expenseStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report.expenses.byStatus).map(([name, value]) => ({
          name: humanizeStatus(name),
          value,
        })),
      ),
    [report],
  );

  const expenseCategoryChart = useMemo(
    () =>
      toChartData(
        report.expenses.byCategory.map((row) => ({
          name: row.name,
          value: row.amount,
        })),
      ),
    [report],
  );

  const evaluationStatusChart = useMemo(
    () =>
      toChartData(
        Object.entries(report.evaluations.byStatus).map(([name, value]) => ({
          name: humanizeStatus(name),
          value,
        })),
      ),
    [report],
  );

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

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip
        query={query}
        label={t(`${PAGE}.tabs.payrollSpend`)}
        columns={3}
      >
        <OverviewStatCard
          index={0}
          icon={Banknote}
          tone="info"
          label={t(`${PAGE}.kpi.totalGross`)}
          value={formatEtbCompact(report.payroll.totalGross)}
          badge={t(`${PAGE}.kpi.payrollRuns`, { count: report.payroll.runs })}
        />
        <OverviewStatCard
          index={1}
          icon={Banknote}
          tone="warn"
          label={t(`${PAGE}.kpi.totalDeductions`)}
          value={formatEtbCompact(report.payroll.totalDeductions)}
          badge={t(`${PAGE}.kpi.deductionsSplit`)}
        />
        <OverviewStatCard
          index={2}
          icon={Banknote}
          tone="ok"
          label={t(`${PAGE}.kpi.totalNet`)}
          value={formatEtbCompact(report.payroll.totalNet)}
        />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSectionCard
          title={t(`${PAGE}.sections.payrollByDepartment`)}
          subtitle={t(`${PAGE}.sections.payrollByDepartmentSubtitle`)}
          icon={<Banknote size={18} strokeWidth={1.9} />}
          tone="info"
          query={query}
          isEmpty={payrollDepartmentChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrHorizontalBarChart
            data={payrollDepartmentChart}
            emptyDescription={chartEmpty}
            valueFormatter={formatEtbCompact}
          />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.payrollStatus`)}
          subtitle={t(`${PAGE}.sections.payrollStatusSubtitle`)}
          icon={<Banknote size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={payrollStatusChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrPieChart
            data={payrollStatusChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSectionCard
          title={t(`${PAGE}.sections.travelMix`)}
          subtitle={t(`${PAGE}.sections.travelMixSubtitle`)}
          icon={<Plane size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={travelMixChart.every((d) => d.value === 0)}
          emptyLabel={chartEmpty}
        >
          <HrDonutChart data={travelMixChart} emptyDescription={chartEmpty} />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.evaluationStatus`)}
          subtitle={t(`${PAGE}.sections.evaluationStatusSubtitle`)}
          icon={<ClipboardCheck size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={evaluationStatusChart.length === 0}
          emptyLabel={t(`${PAGE}.sections.noEvaluations`)}
        >
          <HrDonutChart
            data={evaluationStatusChart}
            emptyDescription={t(`${PAGE}.sections.noEvaluations`)}
            compactEmpty
          />
        </ReportSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSectionCard
          title={t(`${PAGE}.sections.expenseStatus`)}
          subtitle={t(`${PAGE}.sections.expenseStatusSubtitle`)}
          icon={<Wallet size={18} strokeWidth={1.9} />}
          tone="warn"
          query={query}
          isEmpty={expenseStatusChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrPieChart
            data={expenseStatusChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
        <ReportSectionCard
          title={t(`${PAGE}.sections.expenseCategories`)}
          subtitle={t(`${PAGE}.sections.expenseCategoriesSubtitle`)}
          icon={<Wallet size={18} strokeWidth={1.9} />}
          query={query}
          isEmpty={expenseCategoryChart.length === 0}
          emptyLabel={chartEmpty}
        >
          <HrHorizontalBarChart
            data={expenseCategoryChart}
            emptyDescription={chartEmpty}
          />
        </ReportSectionCard>
      </div>

      <ReportSectionCard
        title={t(`${PAGE}.sections.expenseCategoriesTable`)}
        subtitle={t(`${PAGE}.sections.expenseCategoriesSubtitle`)}
        icon={<Wallet size={18} strokeWidth={1.9} />}
        query={query}
        action={
          <Button
            type="link"
            size="small"
            aria-expanded={showExpenseTable}
            aria-controls="hr-report-table-expenseCategories"
            onClick={() => setExpenseTableOpen(!showExpenseTable)}
          >
            {t(
              showExpenseTable ? `${PAGE}.hideTable` : `${PAGE}.showTable`,
            )}
          </Button>
        }
        isEmpty={false}
        flush
      >
        <div id="hr-report-table-expenseCategories" className="w-full min-w-0">
          {showExpenseTable ? (
            <DataTable<HrReportNamedAmount>
              rowKey="name"
              size="small"
              className="erp-pro-table erp-users-table w-full max-w-none"
              scroll={false}
              columns={expenseCategoryColumns}
              dataSource={report.expenses.byCategory}
              pagination={false}
              locale={{ emptyText }}
            />
          ) : null}
        </div>
      </ReportSectionCard>
    </div>
  );
}
