'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  ImportOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import AttendanceStatBar from '@/components/modules/hr/attendance/AttendanceStatBar';
import AttendanceTable from '@/components/modules/hr/attendance/AttendanceTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useAttendanceRecords } from '@/lib/query/attendance';

/**
 * HR attendance list — month/year filters, stats, and import placeholder.
 */
export default function AttendanceListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const listParams = useMemo(
    () => ({
      month,
      year,
      page,
      limit,
      ...(canViewHr && debouncedSearch
        ? { search: debouncedSearch }
        : {}),
    }),
    [month, year, page, limit, canViewHr, debouncedSearch],
  );

  const listQuery = useAttendanceRecords(listParams, true);

  const records = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;

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

  function handleMonthChange(value: number | null): void {
    if (value == null) {
      return;
    }
    setMonth(value);
    setPage(1);
  }

  function handleYearChange(value: number | null): void {
    if (value == null) {
      return;
    }
    setYear(value);
    setPage(1);
  }

  function handlePaginationChange(nextPage: number, nextPageSize: number): void {
    setPage(nextPage);
    setLimit(nextPageSize);
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
        records={records}
        loading={listQuery.isFetching && !listQuery.data}
      />

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Select
              value={month}
              options={monthOptions}
              onChange={handleMonthChange}
              style={{ width: 140 }}
              aria-label={t('pages.hr.attendance.filters.month')}
            />
            <InputNumber
              value={year}
              min={2020}
              max={2030}
              onChange={handleYearChange}
              style={{ width: 100 }}
              aria-label={t('pages.hr.attendance.filters.year')}
            />
            {canViewHr ? (
              <Input
                allowClear
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('pages.hr.attendance.filters.search')}
                prefix={<SearchOutlined />}
                style={{ width: 220 }}
              />
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
              <Tooltip title={t('pages.hr.attendance.importComingSoon')}>
                <Button
                  type="primary"
                  icon={<ImportOutlined />}
                  disabled
                >
                  {t('pages.hr.attendance.import')}
                </Button>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <AttendanceTable
          records={records}
          loading={listQuery.isFetching}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            onChange: handlePaginationChange,
          }}
          emptyText={
            <TableEmptyState
              icon={<CalendarOutlined />}
              title={t('pages.hr.attendance.emptyTitle', {
                month: monthName,
                year,
              })}
              description={t('pages.hr.attendance.emptyDescription')}
            />
          }
        />
      </div>
    </div>
  );
}
