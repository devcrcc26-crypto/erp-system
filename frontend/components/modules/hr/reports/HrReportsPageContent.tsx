'use client';

import '@/components/modules/dashboard/home/dashboard-v2.css';
import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Select,
  Skeleton,
  Tooltip,
} from 'antd';
import type { LucideIcon } from 'lucide-react';
import { ReloadOutlined } from '@ant-design/icons';
import {
  Banknote,
  CalendarClock,
  LayoutDashboard,
  Timer,
} from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import {
  HR_REPORT_TAB_PARAM,
  HR_REPORT_TABS,
  isHrReportTab,
  PAGE,
  type HrReportTabId,
} from '@/components/modules/hr/reports/hr-report-tabs';
import ContractsAttendanceTab from '@/components/modules/hr/reports/tabs/ContractsAttendanceTab';
import LeaveOtTab from '@/components/modules/hr/reports/tabs/LeaveOtTab';
import OverviewTab from '@/components/modules/hr/reports/tabs/OverviewTab';
import PayrollSpendTab from '@/components/modules/hr/reports/tabs/PayrollSpendTab';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCanViewHr, useIsHrManager } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDepartments } from '@/lib/query/org';
import { useHrReport } from '@/lib/query/hr-report';
import { buildHrReportExportSheets } from '@/lib/utils/hr-report-export';
import { formatProjectDate } from '@/lib/utils/project-display';

const DATE_FORMAT = 'YYYY-MM-DD';

const TAB_LABEL_KEYS: Record<HrReportTabId, string> = {
  overview: 'overview',
  'leave-ot': 'leaveOt',
  'payroll-spend': 'payrollSpend',
  'contracts-attendance': 'contractsAttendance',
};

const TAB_ICONS: Record<HrReportTabId, LucideIcon> = {
  overview: LayoutDashboard,
  'leave-ot': Timer,
  'payroll-spend': Banknote,
  'contracts-attendance': CalendarClock,
};

function tabDomId(id: HrReportTabId): string {
  return `hr-report-tab-${id}`;
}

function panelDomId(id: HrReportTabId): string {
  return `hr-report-panel-${id}`;
}

const PAGE_ROOT = `erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employees-v2 erp-dashboard-v2 erp-hr-reports-page w-full max-w-none ${LIST_PAGE_V2}`;

function TabPanelContent({
  tab,
  report,
  query,
  isCompact,
  tablesOpenByDefault,
}: {
  tab: HrReportTabId;
  report: NonNullable<ReturnType<typeof useHrReport>['data']>;
  query: {
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
  };
  isCompact: boolean;
  tablesOpenByDefault: boolean;
}): React.ReactNode {
  const props = { report, query, isCompact, tablesOpenByDefault };
  switch (tab) {
    case 'overview':
      return <OverviewTab {...props} />;
    case 'leave-ot':
      return <LeaveOtTab {...props} />;
    case 'payroll-spend':
      return <PayrollSpendTab {...props} />;
    case 'contracts-attendance':
      return <ContractsAttendanceTab {...props} />;
    default:
      return null;
  }
}

/**
 * HR reports — period filters, dashboard-style tabs, v2 chrome.
 */
function HrReportsPageInner(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canViewHr = useCanViewHr();
  const isHrManager = useIsHrManager();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabRefs = useRef<Partial<Record<HrReportTabId, HTMLButtonElement | null>>>(
    {},
  );

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

  const rawTab = searchParams.get(HR_REPORT_TAB_PARAM);
  const defaultTab: HrReportTabId = 'overview';
  const activeTab: HrReportTabId = isHrReportTab(rawTab) ? rawTab : defaultTab;

  const hrefForTab = (id: HrReportTabId): string => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(HR_REPORT_TAB_PARAM, id);
    return `${pathname}?${next.toString()}`;
  };

  useEffect(() => {
    if (rawTab === null || isHrReportTab(rawTab)) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.set(HR_REPORT_TAB_PARAM, defaultTab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [rawTab, defaultTab, searchParams, pathname, router]);

  const selectTab = (id: HrReportTabId): void => {
    if (id !== activeTab) {
      router.replace(hrefForTab(id), { scroll: false });
    }
  };

  const onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % HR_REPORT_TABS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + HR_REPORT_TABS.length) % HR_REPORT_TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = HR_REPORT_TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = HR_REPORT_TABS[nextIndex];
    selectTab(nextTab);
    const btn = tabRefs.current[nextTab];
    btn?.focus();
    btn?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const widgetQuery = {
    isLoading: reportQuery.isLoading && !report,
    isError: reportQuery.isError,
    refetch: () => reportQuery.refetch(),
  };

  if (!canViewHr) {
    return (
      <div className={PAGE_ROOT}>
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  return (
    <div className={PAGE_ROOT}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 flex-col">
            <h3 className="erp-pro-card-toolbar-title m-0">
              {t(`${PAGE}.title`)}
            </h3>
            <span className="erp-users-cell-sub">
              {t(`${PAGE}.description`)}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
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
                  documentTitle: t(`${PAGE}.title`),
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

      <div
        className="dv2-tabs"
        role="tablist"
        aria-label={t(`${PAGE}.tabs.label`)}
      >
        {HR_REPORT_TABS.map((id, index) => {
          const selected = id === activeTab;
          const TabIcon = TAB_ICONS[id];
          return (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[id] = node;
              }}
              type="button"
              role="tab"
              id={tabDomId(id)}
              aria-selected={selected}
              aria-controls={panelDomId(id)}
              tabIndex={selected ? 0 : -1}
              className={`dv2-tab${selected ? ' dv2-tab--active' : ''}`}
              onClick={(e) => {
                selectTab(id);
                e.currentTarget.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                  inline: 'nearest',
                });
              }}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <span className="dv2-tab-icon" aria-hidden>
                <TabIcon size={16} strokeWidth={2} />
              </span>
              <span>{t(`${PAGE}.tabs.${TAB_LABEL_KEYS[id]}`)}</span>
            </button>
          );
        })}
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
        <div
          key={activeTab}
          role="tabpanel"
          id={panelDomId(activeTab)}
          aria-labelledby={tabDomId(activeTab)}
          tabIndex={0}
          className="dv2-tab-panel"
        >
          <TabPanelContent
            tab={activeTab}
            report={report}
            query={widgetQuery}
            isCompact={isCompact}
            tablesOpenByDefault={isHrManager}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary for static rendering.
 */
export default function HrReportsPageContent(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className={PAGE_ROOT}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      }
    >
      <HrReportsPageInner />
    </Suspense>
  );
}
