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
  LockOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AttendanceDailyLogsDrawer from '@/components/modules/hr/attendance/AttendanceDailyLogsDrawer';
import AttendanceImportModal from '@/components/modules/hr/attendance/AttendanceImportModal';
import AttendanceStatBar from '@/components/modules/hr/attendance/AttendanceStatBar';
import AttendanceTable from '@/components/modules/hr/attendance/AttendanceTable';
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
  const hasData = allRows.length > 0;

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
        <div className="flex justify-center rounded-xl border border-[var(--color-border-tertiary)] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  const emptyState = (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'var(--color-teal-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-teal-400)',
          fontSize: 24,
          marginBottom: 4,
        }}
      >
        <CalendarOutlined />
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 15,
          color: 'var(--color-text-primary)',
        }}
      >
        {t('pages.hr.attendance.emptyTitle', { month: monthName, year })}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-tertiary)',
          maxWidth: 340,
        }}
      >
        {t('pages.hr.attendance.emptyDescription')}
      </div>
      {canViewHr ? (
        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => setImportModalOpen(true)}
          style={{ marginTop: 4 }}
        >
          {t('pages.hr.attendance.import')}
        </Button>
      ) : null}
    </div>
  );

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

      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 4,
          }}
        >
          <h1 className="erp-shell-header-title" style={{ margin: 0 }}>
            {pageTitle}
          </h1>
          {canViewHr && approval ? (
            <Tag color={STATUS_COLORS[approval.status]}>
              {t(`pages.hr.attendance.review.status.${approval.status}`)}
            </Tag>
          ) : null}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {canViewHr
            ? t('pages.hr.attendance.listDescription')
            : t('pages.hr.attendance.myListDescription')}{' '}
          {t('pages.hr.attendance.showingPeriod', {
            month: monthName,
            year: String(year),
          })}
        </p>
      </div>

      <AttendanceStatBar
        records={allRows}
        totalEmployees={allRows.length}
        loading={listQuery.isFetching && !listQuery.data}
      />

      <div className="erp-pro-card" style={{ marginBottom: 16, marginTop: 16 }}>
        <div style={{ padding: '14px 20px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {canViewHr ? (
              <Input
                allowClear
                prefix={<SearchOutlined className="erp-users-search-icon" />}
                placeholder={t('pages.hr.attendance.filters.search')}
                className="erp-users-search-input"
                style={{ minWidth: 220, flex: 1 }}
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
            {hasFilters ? (
              <Button type="link" onClick={handleResetFilters} className="!px-1">
                {t('common.reset')}
              </Button>
            ) : null}
          </div>
        </div>
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--color-border-tertiary)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 8,
            background: 'var(--color-surface-secondary)',
            borderRadius: '0 0 10px 10px',
          }}
        >
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
          {canViewHr ? (
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setImportModalOpen(true)}
            >
              {t('pages.hr.attendance.import')}
              {!hasData ? (
                <span
                  style={{
                    marginLeft: 6,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'currentColor',
                    opacity: 0.7,
                    display: 'inline-block',
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {filtered.length.toLocaleString()}
            </span>
            {approval?.status === 'APPROVED' ? (
              <Tag color="success" icon={<LockOutlined />}>
                {t('pages.hr.attendance.review.status.APPROVED')}
              </Tag>
            ) : null}
          </div>
        </div>

        <div className="erp-pro-table-card-body">
          <AttendanceTable
            records={filtered}
            loading={listQuery.isFetching}
            onViewDailyLogs={canViewHr ? openDailyLogsDrawer : undefined}
            pagination={{
              current: page,
              pageSize: limit,
              total: filtered.length,
              onChange: handlePaginationChange,
            }}
            emptyText={
              hasSearch && filtered.length === 0 ? (
                <div
                  style={{
                    padding: '32px 24px',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {t('pages.hr.attendance.emptyFiltered')}
                  <div style={{ marginTop: 8 }}>
                    <Button type="link" onClick={handleResetFilters}>
                      {t('common.reset')}
                    </Button>
                  </div>
                </div>
              ) : (
                emptyState
              )
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
