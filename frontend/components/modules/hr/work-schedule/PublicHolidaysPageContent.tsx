'use client';

import './public-holidays-v2.css';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { CalendarDays } from 'lucide-react';
import dayjs from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  HolidayNationality,
  PublicHoliday,
} from '@/lib/api/work-schedule.types';
import {
  useBulkHolidayStatus,
  useDeactivatePublicHoliday,
  useDeletePublicHoliday,
  useDuplicateHolidayYear,
  usePublicHolidayList,
  useUpdatePublicHoliday,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const LIST_PATH = '/hr/public-holidays';

type StatusMode = 'all' | 'active' | 'inactive' | 'upcoming';

/**
 * HR public holiday calendar - Employees / leave v2 chrome.
 */
export default function PublicHolidaysPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();

  const [year, setYear] = useState<number | undefined>(undefined);
  const [nationality, setNationality] = useState<
    HolidayNationality | undefined
  >(undefined);
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [fromYear, setFromYear] = useState(dayjs().year());
  const [toYear, setToYear] = useState(dayjs().year() + 1);

  const holidayIdParam = searchParams.get('holidayId');

  useEffect(() => {
    if (holidayIdParam) {
      router.replace(`${LIST_PATH}/${holidayIdParam}`);
    }
  }, [holidayIdParam, router]);

  const listQuery = usePublicHolidayList({ year, nationality }, canViewHr);
  const updateMutation = useUpdatePublicHoliday();
  const deactivateMutation = useDeactivatePublicHoliday();
  const deleteMutation = useDeletePublicHoliday();
  const bulkMutation = useBulkHolidayStatus();
  const duplicateMutation = useDuplicateHolidayYear();

  const rows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    return {
      all: rows.length,
      active: rows.filter((row) => row.isActive).length,
      inactive: rows.filter((row) => !row.isActive).length,
      upcoming: rows.filter((row) => row.isActive && !row.isPast).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusMode === 'active' && !row.isActive) {
        return false;
      }
      if (statusMode === 'inactive' && row.isActive) {
        return false;
      }
      if (statusMode === 'upcoming' && (row.isPast || !row.isActive)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        row.name.toLowerCase().includes(query) ||
        (row.nameZh ?? '').toLowerCase().includes(query)
      );
    });
  }, [rows, search, statusMode]);

  const grouped = useMemo(() => {
    const map = new Map<number, PublicHoliday[]>();
    for (const row of filtered) {
      const y = Number(row.date.slice(0, 4));
      const list = map.get(y) ?? [];
      list.push(row);
      map.set(y, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const hasFilters =
    Boolean(search.trim()) ||
    statusMode !== 'all' ||
    year !== undefined ||
    nationality !== undefined;

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    setSelectedIds([]);
  }

  function handleResetFilters(): void {
    setSearch('');
    setYear(undefined);
    setNationality(undefined);
    setStatusMode('all');
    setSelectedIds([]);
  }

  async function handleDeactivate(id: string): Promise<void> {
    try {
      await deactivateMutation.mutateAsync(id);
      messageApi.success(t('hr.publicHoliday.deactivated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      messageApi.success(t('hr.publicHoliday.deleted'));
      setSelectedIds((ids) => ids.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.deleteFailed'), messageApi);
    }
  }

  async function handleReactivate(row: PublicHoliday): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        id: row.id,
        payload: { isActive: true },
      });
      messageApi.success(t('hr.publicHoliday.reactivated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleBulk(isActive: boolean): Promise<void> {
    if (selectedIds.length === 0) {
      return;
    }
    try {
      await bulkMutation.mutateAsync({ ids: selectedIds, isActive });
      messageApi.success(
        isActive
          ? t('hr.publicHoliday.bulkActivated')
          : t('hr.publicHoliday.bulkDeactivated'),
      );
      setSelectedIds([]);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleDuplicate(): Promise<void> {
    try {
      const result = await duplicateMutation.mutateAsync({ fromYear, toYear });
      messageApi.success(
        t('hr.publicHoliday.duplicated', {
          copied: result.copied,
          skipped: result.skipped,
        }),
      );
      setDuplicateOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.duplicateFailed'), messageApi);
    }
  }

  function appliesLabel(value: HolidayNationality): string {
    if (value === 'ETHIOPIAN') {
      return t('hr.publicHoliday.ethiopianOnly');
    }
    if (value === 'CHINESE') {
      return t('hr.publicHoliday.chineseOnly');
    }
    return t('hr.publicHoliday.allEmployees');
  }

  function daysUntilBadge(row: PublicHoliday): React.ReactNode {
    if (row.isPast) {
      return (
        <StatusBadge label={t('hr.publicHoliday.passed')} variant="default" />
      );
    }
    if (row.daysUntil === 0) {
      return <StatusBadge label={t('hr.publicHoliday.today')} variant="orange" />;
    }
    return (
      <StatusBadge
        label={t('hr.publicHoliday.inDays', { days: row.daysUntil })}
        variant="info"
      />
    );
  }

  function rowMenuItems(row: PublicHoliday): MenuProps['items'] {
    return [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: t('common.view'),
        onClick: () => router.push(`${LIST_PATH}/${row.id}`),
      },
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`${LIST_PATH}/${row.id}/edit`),
      },
      row.isActive
        ? {
            key: 'deactivate',
            icon: <StopOutlined />,
            label: t('hr.publicHoliday.deactivate'),
            danger: true,
            onClick: () => void handleDeactivate(row.id),
          }
        : {
            key: 'reactivate',
            icon: <CheckCircleOutlined />,
            label: t('hr.publicHoliday.reactivate'),
            onClick: () => void handleReactivate(row),
          },
      { type: 'divider' },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('hr.publicHoliday.delete'),
        danger: true,
        onClick: () => setDeleteTarget(row),
      },
    ];
  }

  const columns: ColumnsType<PublicHoliday> = useMemo(
    () => [
      {
        title: t('hr.publicHoliday.name'),
        dataIndex: 'name',
        key: 'name',
        render: (_value: string, row) => (
          <div className="erp-ph-person">
            <span className="erp-ph-icon" aria-hidden>
              <CalendarOutlined />
            </span>
            <div className="min-w-0">
              <p className="erp-users-name m-0 truncate">{row.name}</p>
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.nameZh || formatProjectDate(row.date)}
              </p>
            </div>
          </div>
        ),
      },
      {
        title: t('hr.publicHoliday.date'),
        dataIndex: 'date',
        key: 'date',
        width: isNarrow ? 110 : 140,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.publicHoliday.appliesTo'),
        dataIndex: 'appliesToNationality',
        key: 'appliesToNationality',
        responsive: ['md'],
        render: (value: HolidayNationality) => (
          <span className="erp-users-cell-sub">{appliesLabel(value)}</span>
        ),
      },
      {
        title: t('hr.publicHoliday.recurring'),
        dataIndex: 'isRecurring',
        key: 'isRecurring',
        width: 100,
        responsive: ['lg'],
        render: (value: boolean) => (
          <span className="erp-users-cell-sub">
            {value ? t('common.yes') : t('common.no')}
          </span>
        ),
      },
      {
        title: t('hr.publicHoliday.active'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: 110,
        render: (value: boolean) => (
          <StatusBadge
            label={value ? t('common.active') : t('common.inactive')}
            variant={value ? 'success' : 'default'}
          />
        ),
      },
      {
        title: t('hr.publicHoliday.when'),
        key: 'when',
        width: 130,
        render: (_value, row) => daysUntilBadge(row),
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 56,
        align: 'right',
        render: (_value, row) => (
          <div
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              trigger={['click']}
              menu={{ items: rowMenuItems(row) }}
            >
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [isNarrow, router, t],
  );

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-public-holidays-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-public-holidays-v2">
        <div className="erp-ph-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-public-holidays-v2">
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('hr.publicHoliday.deleteTitle')}
        description={t('hr.publicHoliday.deleteDescription', {
          name: deleteTarget?.name ?? '',
        })}
        confirmLabel={t('hr.publicHoliday.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        rootClassName="erp-ph-duplicate-modal"
        title={t('hr.publicHoliday.duplicateYear')}
        open={duplicateOpen}
        onCancel={() => setDuplicateOpen(false)}
        onOk={() => void handleDuplicate()}
        confirmLoading={duplicateMutation.isPending}
        okText={t('hr.publicHoliday.duplicate')}
      >
        <p className="erp-users-cell-sub mb-3">
          {t('hr.publicHoliday.duplicateYearHint')}
        </p>
        <div className="flex flex-col gap-3">
          <Space.Compact className="w-full">
            <Button disabled>{t('hr.publicHoliday.fromYear')}</Button>
            <InputNumber
              className="w-full"
              value={fromYear}
              onChange={(value) => setFromYear(Number(value ?? fromYear))}
            />
          </Space.Compact>
          <Space.Compact className="w-full">
            <Button disabled>{t('hr.publicHoliday.toYear')}</Button>
            <InputNumber
              className="w-full"
              value={toYear}
              onChange={(value) => setToYear(Number(value ?? toYear))}
            />
          </Space.Compact>
        </div>
      </Modal>

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-0"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.publicHoliday.loadError'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label={t('hr.publicHoliday.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<CalendarOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <EvaluationStat
          label={t('hr.publicHoliday.stats.active')}
          value={statusCounts.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => handleStatusMode('active')}
        />
        <EvaluationStat
          label={t('hr.publicHoliday.stats.inactive')}
          value={statusCounts.inactive}
          accent="slate"
          icon={<StopOutlined />}
          active={statusMode === 'inactive'}
          onClick={() => handleStatusMode('inactive')}
        />
        <EvaluationStat
          label={t('hr.publicHoliday.stats.upcoming')}
          value={statusCounts.upcoming}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'upcoming'}
          onClick={() => handleStatusMode('upcoming')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.hr.publicHolidays.listTitle')}
            </h3>
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
            {selectedIds.length > 0 ? (
              <Space.Compact>
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => void handleBulk(true)}
                  loading={bulkMutation.isPending}
                >
                  {isCompact ? undefined : t('hr.publicHoliday.reactivate')}
                </Button>
                <Button
                  icon={<StopOutlined />}
                  danger
                  onClick={() => void handleBulk(false)}
                  loading={bulkMutation.isPending}
                >
                  {isCompact ? undefined : t('hr.publicHoliday.deactivate')}
                </Button>
              </Space.Compact>
            ) : null}
            <HrListActions
              compact={isCompact}
              extra={
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => setDuplicateOpen(true)}
                >
                  {t('hr.publicHoliday.duplicateYear')}
                </Button>
              }
              extraMenuItems={[
                {
                  key: 'duplicate',
                  icon: <CopyOutlined />,
                  label: t('hr.publicHoliday.duplicateYear'),
                  onClick: () => setDuplicateOpen(true),
                },
              ]}
              primary={{
                label: t('hr.publicHoliday.new'),
                icon: <PlusOutlined />,
                onClick: () => router.push(`${LIST_PATH}/new`),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.publicHoliday.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIds([]);
            }}
            onClear={() => {
              setSearch('');
              setSelectedIds([]);
            }}
          />
          <Select
            allowClear
            placeholder={t('hr.publicHoliday.filterYear')}
            className="erp-users-filter-select"
            value={year}
            onChange={(value: number | undefined) => {
              setYear(value);
              setSelectedIds([]);
            }}
            options={Array.from({ length: 8 }, (_, index) => {
              const y = dayjs().year() - 2 + index;
              return { value: y, label: String(y) };
            })}
          />
          <Select
            allowClear
            placeholder={t('hr.publicHoliday.appliesTo')}
            className="erp-users-filter-select"
            value={nationality}
            onChange={(value: HolidayNationality | undefined) => {
              setNationality(value);
              setSelectedIds([]);
            }}
            options={[
              { value: 'ALL', label: t('hr.publicHoliday.allEmployees') },
              {
                value: 'ETHIOPIAN',
                label: t('hr.publicHoliday.ethiopianOnly'),
              },
              { value: 'CHINESE', label: t('hr.publicHoliday.chineseOnly') },
            ]}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          {grouped.length === 0 ? (
            <TableEmptyState
              icon={<CalendarDays />}
              title={
                hasFilters
                  ? t('hr.publicHoliday.emptyFiltered')
                  : t('hr.publicHoliday.empty')
              }
              description={
                hasFilters
                  ? t('pages.hr.publicHolidays.listDescription')
                  : t('hr.publicHoliday.emptyHint')
              }
              action={
                hasFilters
                  ? {
                      label: t('common.reset'),
                      onClick: handleResetFilters,
                    }
                  : {
                      label: t('hr.publicHoliday.new'),
                      onClick: () => router.push(`${LIST_PATH}/new`),
                    }
              }
            />
          ) : (
            grouped.map(([groupYear, holidays]) => (
              <div key={groupYear} className="erp-ph-year-block">
                <h3 className="erp-ph-year-heading">
                  {groupYear}
                  <span className="erp-ph-year-count">
                    {holidays.length.toLocaleString()}
                  </span>
                </h3>
                <DataTable<PublicHoliday>
                  rowKey="id"
                  className="erp-pro-table erp-users-table"
                  size={isCompact ? 'small' : 'middle'}
                  columns={columns}
                  dataSource={holidays}
                  loading={listQuery.isFetching && holidays.length === 0}
                  pagination={false}
                  scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 960 }}
                  rowSelection={{
                    selectedRowKeys: selectedIds,
                    onChange: (keys) => setSelectedIds(keys.map(String)),
                  }}
                  rowClassName={(row) =>
                    `cursor-pointer${row.isActive ? '' : ' erp-ph-row-inactive'}`
                  }
                  onRow={(record) => ({
                    onClick: (event) => {
                      const target = event.target as HTMLElement;
                      if (
                        target.closest(
                          '.ant-checkbox-wrapper, .ant-dropdown, button, .erp-table-row-actions',
                        )
                      ) {
                        return;
                      }
                      router.push(`${LIST_PATH}/${record.id}`);
                    },
                  })}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
