'use client';
import { accent } from '@/lib/theme/accent';

import '@/components/modules/users/employees-v2.css';
import './payroll-v2.css';
import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Grid,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Wallet } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import PayrollAttendanceToggle from '@/components/modules/hr/payroll/PayrollAttendanceToggle';
import PayrollCompanySettingsModal from '@/components/modules/hr/payroll/PayrollCompanySettingsModal';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessPayroll,
  useCanCreateNextMonthPayroll,
  useCanCreatePayroll,
  useCanEditPayroll,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PayrollRunListItem,
  PayrollRunStatus,
} from '@/lib/api/payroll.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useCreatePayrollRun,
  usePayrollCompanySettings,
  usePayrollRuns,
} from '@/lib/query/payroll';
import { disablePayrollCreateMonths } from '@/lib/utils/date-validation';
import {
  formatPayrollMoney,
  formatPayrollPeriod,
  payrollStatusLabelKey,
  payrollStatusTagStyle,
  PAYROLL_MONEY_CELL_STYLE,
} from '@/lib/utils/payroll-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const STAT_ACCENT = {
  teal: { bg: accent.light, fg: accent.primary },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

type PayrollFilterMode = 'all' | 'in_progress' | 'paid' | 'flagged';

const IN_PROGRESS_STATUSES: PayrollRunStatus[] = [
  'DRAFT',
  'REVIEWED',
  'SUBMITTED',
  'APPROVED',
  'GM_APPROVED',
];

function PayrollStat({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <button
      type="button"
      className={`erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}`}
      onClick={onClick}
    >
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value}</p>
      </div>
    </button>
  );
}

function matchesFilter(
  row: PayrollRunListItem,
  mode: PayrollFilterMode,
): boolean {
  switch (mode) {
    case 'in_progress':
      return IN_PROGRESS_STATUSES.includes(row.status);
    case 'paid':
      return row.status === 'PAID';
    case 'flagged':
      return row.flaggedCount > 0 && row.status !== 'CANCELLED';
    default:
      return row.status !== 'CANCELLED';
  }
}

/**
 * Payroll runs list - Users / per-diem list chrome (stat bar, filters, card table).
 */
export default function PayrollRunsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canAccess = useCanAccessPayroll();
  const canCreate = useCanCreatePayroll();
  const canCreateNextMonth = useCanCreateNextMonthPayroll();
  const canEdit = useCanEditPayroll();
  const listQuery = usePayrollRuns(canAccess);
  const disableCreatePeriod = useMemo(
    () => disablePayrollCreateMonths(canCreateNextMonth),
    [canCreateNextMonth],
  );
  const createMutation = useCreatePayrollRun();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [period, setPeriod] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState('');
  // null = not touched yet: follow the company default.
  const [considerAttendance, setConsiderAttendance] = useState<boolean | null>(null);
  const settingsQuery = usePayrollCompanySettings(createOpen);
  const attendanceOn =
    considerAttendance ?? settingsQuery.data?.considerAttendanceDefault ?? true;
  const [filterMode, setFilterMode] = useState<PayrollFilterMode>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayrollRunStatus | undefined>();

  const allRows = listQuery.data ?? [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const statusCounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const scoped = allRows.filter((row) => {
      if (!query) {
        return true;
      }
      const periodLabel = formatPayrollPeriod(row.month, row.year).toLowerCase();
      return (
        row.runNumber.toLowerCase().includes(query) ||
        periodLabel.includes(query)
      );
    });
    const active = scoped.filter(
      (row) => row.status !== 'CANCELLED' && row.status !== 'SUPERSEDED',
    );
    return {
      all: active.length,
      inProgress: active.filter((row) =>
        IN_PROGRESS_STATUSES.includes(row.status),
      ).length,
      paid: active.filter((row) => row.status === 'PAID').length,
      flagged: active.filter((row) => row.flaggedCount > 0).length,
    };
  }, [allRows, search]);

  const summary = useMemo(() => {
    const currentRun = allRows.find(
      (row) =>
        row.month === currentMonth &&
        row.year === currentYear &&
        row.type !== 'CORRECTION' &&
        row.status !== 'CANCELLED' &&
        row.status !== 'SUPERSEDED',
    );
    const lastPaid = allRows.find((row) => row.status === 'PAID');
    return {
      currentStatus: currentRun
        ? t(payrollStatusLabelKey(currentRun.status))
        : t('hr.payroll.list.noCurrentRun'),
      lastPaidNet: lastPaid
        ? formatPayrollMoney(lastPaid.totalNetPay, { emptyZero: false })
        : '-',
    };
  }, [allRows, currentMonth, currentYear, t]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (!matchesFilter(row, filterMode)) {
        return false;
      }
      if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      // Superseded versions are history (see the run's History tab) unless asked for.
      if (row.status === 'SUPERSEDED' && statusFilter !== 'SUPERSEDED') {
        return false;
      }
      if (!query) {
        return true;
      }
      const periodLabel = formatPayrollPeriod(row.month, row.year).toLowerCase();
      return (
        row.runNumber.toLowerCase().includes(query) ||
        periodLabel.includes(query)
      );
    });
  }, [allRows, filterMode, statusFilter, search]);

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const hasFilters =
    Boolean(search.trim()) ||
    filterMode !== 'all' ||
    statusFilter !== undefined;

  const columns: ColumnsType<PayrollRunListItem> = useMemo(
    () => [
      {
        title: t('hr.payroll.list.runNumber'),
        dataIndex: 'runNumber',
        key: 'runNumber',
        width: isNarrow ? 100 : 130,
        render: (value: string, row) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{value}</p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {formatPayrollPeriod(row.month, row.year)}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.payroll.list.period'),
        key: 'period',
        width: 160,
        responsive: ['md'],
        render: (_: unknown, row) => (
          <span className="erp-users-cell-strong">
            {formatPayrollPeriod(row.month, row.year)}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 140 : 180,
        render: (status: PayrollRunListItem['status'], row) => (
          <div className="flex flex-wrap items-center gap-1">
            {row.type === 'CORRECTION' && status === 'SUPERSEDED' ? (
              <Tag variant="filled" className="erp-payroll-status" style={payrollStatusTagStyle('SUPERSEDED')}>
                {t('hr.payroll.list.badgeVoided')}
              </Tag>
            ) : null}
            {row.type === 'CORRECTION' && status !== 'SUPERSEDED' && status !== 'CANCELLED' ? (
              <Tag
                variant="filled"
                className="erp-payroll-status"
                style={{ color: '#9A3412', background: '#FFF7ED' }}
              >
                {t('hr.payroll.list.badgeCorrection')}
              </Tag>
            ) : null}
            {status !== 'SUPERSEDED' || row.type !== 'CORRECTION' ? (
              <Tag
                variant="filled"
                className="erp-payroll-status"
                style={payrollStatusTagStyle(status)}
              >
                {t(payrollStatusLabelKey(status))}
              </Tag>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.payroll.list.employees'),
        key: 'employees',
        width: 100,
        align: 'right',
        responsive: ['lg'],
        render: (_: unknown, row) => (
          <span className="erp-users-cell-strong">{row._count.entries}</span>
        ),
      },
      {
        title: t('hr.payroll.list.totalGross'),
        dataIndex: 'totalGross',
        key: 'totalGross',
        align: 'right',
        responsive: ['lg'],
        render: (value) => (
          <span className="erp-users-cell-sub" style={PAYROLL_MONEY_CELL_STYLE}>
            {formatPayrollMoney(value, { emptyZero: false })}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.totalNet'),
        dataIndex: 'totalNetPay',
        key: 'totalNetPay',
        align: 'right',
        render: (value) => (
          <span
            className="erp-users-cell-strong"
            style={PAYROLL_MONEY_CELL_STYLE}
          >
            {formatPayrollMoney(value, { emptyZero: false })}
          </span>
        ),
      },
      {
        title: t('hr.payroll.list.flagged'),
        dataIndex: 'flaggedCount',
        key: 'flaggedCount',
        width: 90,
        align: 'right',
        responsive: ['md'],
        render: (count: number) =>
          count > 0 ? (
            <span className="erp-payroll-flag-count">{count}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t('hr.payroll.list.created'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 110,
        responsive: ['xl'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {dayjs(value).format('YYYY-MM-DD')}
          </span>
        ),
      },
    ],
    [isNarrow, t],
  );

  function handleFilterMode(mode: PayrollFilterMode): void {
    setFilterMode(mode);
    resetPage();
  }

  function handleResetFilters(): void {
    setSearch('');
    setFilterMode('all');
    setStatusFilter(undefined);
    resetPage();
  }

  async function handleCreateRun(): Promise<void> {
    if (!period) {
      messageApi.warning(t('hr.payroll.create.selectPeriodRequired'));
      return;
    }
    try {
      const run = await createMutation.mutateAsync({
        month: period.month() + 1,
        year: period.year(),
        notes: notes.trim() || undefined,
        considerAttendance: attendanceOn,
      });
      messageApi.success(t('hr.payroll.create.success'));
      setCreateOpen(false);
      setPeriod(null);
      setNotes('');
      setConsiderAttendance(null);
      router.push(`/hr/payroll/${run.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else {
        notifyApiError(error, 'Request failed', messageApi);
      }
    }
  }

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-employees-v2 erp-payroll-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-employees-v2 erp-payroll-v2">
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-employees-v2 erp-payroll-v2">
      <Modal
        title={t('hr.payroll.create.title')}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setPeriod(null);
          setNotes('');
          setConsiderAttendance(null);
        }}
        onOk={() => void handleCreateRun()}
        okText={t('hr.payroll.create.submit')}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.list.emptyDescription')}</p>
        <Form layout="vertical">
          <Form.Item
            label={t('hr.payroll.create.period')}
            required
            extra={
              canCreateNextMonth
                ? t('hr.payroll.create.periodNextMonthHint')
                : undefined
            }
          >
            <DatePicker
              picker="month"
              value={period}
              onChange={(value) => setPeriod(value)}
              disabledDate={disableCreatePeriod}
              className="w-full"
              placeholder={t('hr.payroll.create.periodPlaceholder')}
            />
          </Form.Item>
          <Form.Item>
            <PayrollAttendanceToggle
              checked={attendanceOn}
              onChange={setConsiderAttendance}
              loading={settingsQuery.isLoading && considerAttendance === null}
            />
          </Form.Item>
          <Form.Item label={t('hr.payroll.create.notes')}>
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <PayrollCompanySettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        readOnly={!canEdit && !canCreate}
      />

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-3"
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.payroll.list.loadError')
          }
        />
      ) : null}

      <section
        className="erp-employees-hero"
        aria-labelledby="erp-payroll-hero-title"
      >
        <div className="erp-employees-hero-top">
          <h2
            id="erp-payroll-hero-title"
            className="erp-employees-hero-title"
          >
            {t('pages.hr.listHeroTitle', {
              title: t('hr.payroll.list.title'),
              count: meta.total.toLocaleString(),
            })}
          </h2>
          <div className="erp-employees-hero-actions">
            {canAccess ? (
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
                data-shot="payroll-company-settings"
              >
                {isNarrow
                  ? t('hr.payroll.companySettings.openButtonShort')
                  : t('hr.payroll.companySettings.openButton')}
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
                data-shot="payroll-new-run"
              >
                {isNarrow
                  ? t('hr.payroll.list.newRunShort')
                  : t('hr.payroll.list.newRun')}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="erp-users-stat-bar erp-employees-hero-stats">
        <PayrollStat
          label={t('hr.payroll.list.statTotalRuns')}
          value={statusCounts.all}
          accent="teal"
          icon={<Wallet size={14} strokeWidth={2} />}
          active={filterMode === 'all'}
          onClick={() => handleFilterMode('all')}
        />
        <PayrollStat
          label={t('hr.payroll.list.statInProgress')}
          value={statusCounts.inProgress}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={filterMode === 'in_progress'}
          onClick={() => handleFilterMode('in_progress')}
        />
        <PayrollStat
          label={t('hr.payroll.list.statPaid')}
          value={statusCounts.paid}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={filterMode === 'paid'}
          onClick={() => handleFilterMode('paid')}
        />
        <PayrollStat
          label={t('hr.payroll.list.statFlagged')}
          value={statusCounts.flagged}
          accent="red"
          icon={<WarningOutlined />}
          active={filterMode === 'flagged'}
          onClick={() => handleFilterMode('flagged')}
        />
        </div>
      </section>

      <div className="erp-pro-card erp-employees-list-card overflow-hidden">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <DollarOutlined />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="erp-pro-card-toolbar-title m-0">
                {t('hr.payroll.list.title')}
              </h3>
              <p className="erp-users-cell-sub m-0 hidden sm:block">
                {t('hr.payroll.list.summaryLine', {
                  current: summary.currentStatus,
                  lastPaid: summary.lastPaidNet,
                })}
              </p>
            </div>
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
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.payroll.list.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Select
            allowClear
            placeholder={t('hr.payroll.list.status')}
            className="erp-users-filter-select"
            value={statusFilter}
            onChange={(value: PayrollRunStatus | undefined) => {
              setStatusFilter(value);
              resetPage();
            }}
            options={(
              [
                'DRAFT',
                'REVIEWED',
                'SUBMITTED',
                'APPROVED',
                'GM_APPROVED',
                'PAID',
                'CANCELLED',
                'SUPERSEDED',
              ] as const
            ).map((status) => ({
              value: status,
              label: t(payrollStatusLabelKey(status)),
            }))}
          />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <DataTable<PayrollRunListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/payroll/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<DollarOutlined />}
                title={
                  hasFilters
                    ? t('hr.payroll.list.emptyFilteredTitle')
                    : t('hr.payroll.list.emptyTitle')
                }
                description={
                  hasFilters
                    ? t('hr.payroll.list.emptyFilteredDescription')
                    : t('hr.payroll.list.emptyDescription')
                }
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
