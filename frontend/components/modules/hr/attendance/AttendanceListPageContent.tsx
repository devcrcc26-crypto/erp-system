'use client';

import { useMemo, useState } from 'react';
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
import AttendanceImportModal from '@/components/modules/hr/attendance/AttendanceImportModal';
import AttendanceStatBar from '@/components/modules/hr/attendance/AttendanceStatBar';
import AttendanceTable from '@/components/modules/hr/attendance/AttendanceTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useAttendanceRecordsAll } from '@/lib/query/attendance';
import { useUsersDirectory } from '@/lib/query/users';
import { filterAttendanceRecords } from '@/lib/utils/attendance-list-filter';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * HR attendance list — load month/year from API, filter/search on the frontend.
 */
export default function AttendanceListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();

  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 200 },
    { enabled: canViewHr },
  );

  const listQuery = useAttendanceRecordsAll({ month, year }, true);
  const allRows = listQuery.data ?? [];

  const filtered = useMemo(
    () =>
      filterAttendanceRecords(allRows, {
        search: appliedSearch,
        employeeId: canViewHr ? employeeId : undefined,
      }),
    [allRows, appliedSearch, employeeId, canViewHr],
  );

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: t(`hr.months.${i + 1}`),
      })),
    [t],
  );

  const employeeOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((user) => ({
        value: user.id,
        label: formatUserName(user),
      })),
    [usersQuery.data?.data],
  );

  const monthName = t(`hr.months.${month}`);
  const pageTitle = canViewHr
    ? t('pages.hr.attendance.listTitle')
    : t('pages.hr.attendance.myListTitle');

  const hasSearchOrEmployee =
    Boolean(appliedSearch.trim()) || Boolean(employeeId);
  const hasFilters =
    hasSearchOrEmployee ||
    month !== currentMonth ||
    year !== currentYear;

  function resetPage(): void {
    setPage(1);
  }

  function handleResetFilters(): void {
    setMonth(currentMonth);
    setYear(currentYear);
    setSearch('');
    setAppliedSearch('');
    setEmployeeId(undefined);
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
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
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
        </div>

        <div className="erp-users-filter-bar">
          {canViewHr ? (
            <Input
              allowClear
              prefix={<SearchOutlined className="erp-users-search-icon" />}
              placeholder={t('pages.hr.attendance.filters.search')}
              className="erp-users-search-input min-w-0"
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
          <span className="erp-users-filter-spacer" aria-hidden />
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
              loading={usersQuery.isLoading}
              options={employeeOptions}
              value={employeeId}
              onChange={(value: string | undefined) => {
                setEmployeeId(value);
                resetPage();
              }}
              aria-label={t('hr.placeholder.employee')}
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
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <AttendanceTable
            records={filtered}
            loading={listQuery.isFetching}
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
                  hasSearchOrEmployee && filtered.length === 0
                    ? t('pages.hr.attendance.emptyFiltered')
                    : t('pages.hr.attendance.emptyTitle', {
                        month: monthName,
                        year,
                      })
                }
                description={
                  hasSearchOrEmployee && filtered.length === 0
                    ? undefined
                    : t('pages.hr.attendance.emptyDescription')
                }
                action={
                  hasSearchOrEmployee && filtered.length === 0
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
          }}
        />
      ) : null}
    </div>
  );
}
