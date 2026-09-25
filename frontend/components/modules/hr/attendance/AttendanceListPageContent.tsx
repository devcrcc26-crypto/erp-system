'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ImportOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AttendanceDailyLogsDrawer from '@/components/modules/hr/attendance/AttendanceDailyLogsDrawer';
import AttendanceImportModal from '@/components/modules/hr/attendance/AttendanceImportModal';
import AttendanceStatBar from '@/components/modules/hr/attendance/AttendanceStatBar';
import AttendanceTable from '@/components/modules/hr/attendance/AttendanceTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceMonthStatus,
  AttendanceRecord,
} from '@/lib/api/attendance.types';
import {
  useAttendanceMonthlyApproval,
  useAttendanceRecordsAll,
} from '@/lib/query/attendance';
import { filterAttendanceRecords } from '@/lib/utils/attendance-list-filter';

const STATUS_COLORS: Record<AttendanceMonthStatus, string> = {
  PENDING_REVIEW: 'blue',
  REVIEWED: 'orange',
  APPROVED: 'green',
  UNLOCKED: 'gold',
};

/**
 * HR attendance list — load month/year from API, filter/search on the frontend.
 */
export default function AttendanceListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const router = useRouter();

  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string | undefined>();

  const listQuery = useAttendanceRecordsAll({ month, year }, true);
  const approvalQuery = useAttendanceMonthlyApproval(month, year, canViewHr);
  const allRows = listQuery.data ?? [];
  const approval = approvalQuery.data ?? null;

  const filtered = useMemo(
    () =>
      filterAttendanceRecords(allRows, {
        search: appliedSearch,
      }),
    [allRows, appliedSearch],
  );

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: t(`hr.months.${i + 1}`),
      })),
    [t],
  );

  const monthName = t(`hr.months.${month}`);
  const pageTitle = canViewHr
    ? t('pages.hr.attendance.listTitle')
    : t('pages.hr.attendance.myListTitle');

  const hasSearch = Boolean(appliedSearch.trim());
  const hasFilters =
    hasSearch || month !== currentMonth || year !== currentYear;

  function resetPage(): void {
    setPage(1);
  }

  function handleResetFilters(): void {
    setMonth(currentMonth);
    setYear(currentYear);
    setSearch('');
    setAppliedSearch('');
    resetPage();
  }

  function handleMonthChange(value: number | null): void {
    if (value == null) {
      return;
    }
    setMonth(value);
    resetPage();
  }

  function handleYearChange(value: number | null): void {
    if (value == null) {
      return;
    }
    setYear(value);
    resetPage();
  }

  function handlePaginationChange(
    nextPage: number,
    nextPageSize: number,
  ): void {
    if (nextPageSize !== limit) {
      setLimit(nextPageSize);
      setPage(1);
      return;
    }
    setPage(nextPage);
  }

  function openDailyLogsDrawer(record: AttendanceRecord): void {
    setDrawerEmployeeId(record.employeeId);
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('pages.hr.attendance.loadFailed')
          }
        />
      ) : null}

      <AttendanceStatBar
        records={allRows}
        totalEmployees={allRows.length}
        loading={listQuery.isFetching && !listQuery.data}
      />

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {filtered.length.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="erp-users-filter-bar flex flex-wrap items-center gap-2">
          {canViewHr ? (
            <Input
              allowClear
              prefix={<SearchOutlined className="erp-users-search-icon" />}
              placeholder={t('pages.hr.attendance.filters.search')}
              className="erp-users-search-input min-w-[200px] flex-1"
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                setAppliedSearch(value.trim());
                resetPage();
              }}
              onPressEnter={() => {
                setAppliedSearch(search.trim());
                resetPage();
              }}
              onClear={() => {
                setSearch('');
                setAppliedSearch('');
                resetPage();
              }}
              aria-label={t('pages.hr.attendance.filters.search')}
            />
          ) : null}
          <Select
            value={month}
            options={monthOptions}
            onChange={handleMonthChange}
            className="erp-users-filter-select"
            placeholder={t('pages.hr.attendance.filters.month')}
            aria-label={t('pages.hr.attendance.filters.month')}
          />
          <InputNumber
            value={year}
            min={2020}
            max={2030}
            onChange={handleYearChange}
            className="w-28"
            aria-label={t('pages.hr.attendance.filters.year')}
          />
          {canViewHr && approval ? (
            <Tag color={STATUS_COLORS[approval.status]}>
              {t(`pages.hr.attendance.review.status.${approval.status}`)}
            </Tag>
          ) : null}
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}

          <span className="erp-users-filter-spacer" aria-hidden />

          {canViewHr ? (
            <Button
              icon={<CheckCircleOutlined />}
              onClick={() =>
                router.push(`/hr/attendance/review/${month}/${year}`)
              }
            >
              {t('pages.hr.attendance.review.reviewButton', {
                month: monthName,
                year: String(year),
              })}
            </Button>
          ) : null}
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
          {canViewHr ? (
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={() => setImportModalOpen(true)}
            >
              {t('pages.hr.attendance.import')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <AttendanceTable
            records={filtered}
            loading={listQuery.isFetching}
            onViewDailyLogs={
              canViewHr ? openDailyLogsDrawer : undefined
            }
            pagination={{
              current: page,
              pageSize: limit,
              total: filtered.length,
              onChange: handlePaginationChange,
            }}
            emptyText={
              <TableEmptyState
                icon={<CalendarOutlined />}
                title={
                  hasSearch && filtered.length === 0
                    ? t('pages.hr.attendance.emptyFiltered')
                    : t('pages.hr.attendance.emptyTitle', {
                        month: monthName,
                        year,
                      })
                }
                description={
                  hasSearch && filtered.length === 0
                    ? undefined
                    : t('pages.hr.attendance.emptyDescription')
                }
                action={
                  hasSearch && filtered.length === 0
                    ? {
                        label: t('common.reset'),
                        onClick: handleResetFilters,
                      }
                    : undefined
                }
              />
            }
          />
        </div>
      </div>

      {canViewHr ? (
        <AttendanceImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onSuccess={() => {
            setImportModalOpen(false);
            void listQuery.refetch();
            void approvalQuery.refetch();
          }}
        />
      ) : null}

      {canViewHr ? (
        <AttendanceDailyLogsDrawer
          employeeId={drawerEmployeeId}
          month={month}
          year={year}
          canCorrect={false}
          onClose={() => setDrawerEmployeeId(undefined)}
        />
      ) : null}
    </div>
  );
}
