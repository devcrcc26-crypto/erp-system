'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Input,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarOutlined,
  StopOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { CalendarClock, Clock3, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AssignWorkScheduleModal from '@/components/modules/hr/work-schedule/AssignWorkScheduleModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WorkSchedule, WorkScheduleDay } from '@/lib/api/work-schedule.types';
import {
  useDeactivateWorkSchedule,
  useDeleteWorkSchedule,
  useSetDefaultWorkSchedule,
  useWorkScheduleList,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/work-schedules';

type StatusMode = 'all' | 'active' | 'inactive' | 'default';

const DAY_SHORT_KEYS = [
  'hr.workSchedule.dayShort0',
  'hr.workSchedule.dayShort1',
  'hr.workSchedule.dayShort2',
  'hr.workSchedule.dayShort3',
  'hr.workSchedule.dayShort4',
  'hr.workSchedule.dayShort5',
  'hr.workSchedule.dayShort6',
] as const;

function dayTone(day: WorkScheduleDay | undefined): string {
  if (!day || !day.isWorkingDay) {
    return 'bg-slate-100 text-slate-400';
  }
  if (day.isHalfDay) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-emerald-100 text-emerald-800';
}

function WeekStrip({
  days,
  t,
}: {
  days: WorkScheduleDay[];
  t: (key: string) => string;
}): React.ReactNode {
  const byDow = new Map(days.map((day) => [day.dayOfWeek, day]));
  return (
    <div className="flex gap-1" aria-hidden>
      {DAY_SHORT_KEYS.map((key, index) => {
        const day = byDow.get(index);
        return (
          <span
            key={key}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold ${dayTone(day)}`}
            title={t(key)}
          >
            {t(key)}
          </span>
        );
      })}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: 'teal' | 'green' | 'slate' | 'amber';
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  const chip = {
    teal: 'bg-emerald-50 text-emerald-700',
    green: 'bg-lime-50 text-lime-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-3.5 rounded-2xl bg-white px-5 py-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
        active
          ? 'bg-emerald-50/80 shadow-[inset_0_0_0_2px_#1d9e75,0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]'
          : ''
      }`}
    >
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${chip}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium tracking-[0.06em] text-slate-500 uppercase">
          {label}
        </span>
        <span className="mt-1 block text-2xl font-semibold tracking-tight text-slate-900">
          {value.toLocaleString()}
        </span>
      </span>
    </button>
  );
}

/**
 * Work schedule list - Tailwind v2 chrome with floating stats and soft cards.
 */
export default function WorkSchedulesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;

  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [search, setSearch] = useState('');
  const [assignSchedule, setAssignSchedule] = useState<WorkSchedule | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<WorkSchedule | null>(null);

  const listQuery = useWorkScheduleList(canViewHr);
  const deactivateMutation = useDeactivateWorkSchedule();
  const deleteMutation = useDeleteWorkSchedule();
  const defaultMutation = useSetDefaultWorkSchedule();
  const schedules = listQuery.data ?? [];

  const statusCounts = useMemo(
    () => ({
      all: schedules.length,
      active: schedules.filter((row) => row.isActive).length,
      inactive: schedules.filter((row) => !row.isActive).length,
      default: schedules.filter((row) => row.isDefault).length,
    }),
    [schedules],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules.filter((row) => {
      if (statusMode === 'active' && !row.isActive) {
        return false;
      }
      if (statusMode === 'inactive' && row.isActive) {
        return false;
      }
      if (statusMode === 'default' && !row.isDefault) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        row.name.toLowerCase().includes(query) ||
        (row.description ?? '').toLowerCase().includes(query)
      );
    });
  }, [schedules, search, statusMode]);

  const hasFilters = Boolean(search.trim()) || statusMode !== 'all';

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    try {
      const result = await deleteMutation.mutateAsync(deleteTarget.id);
      messageApi.success(
        t('hr.workSchedule.deleted', {
          count: result.movedEmployees,
          schedule: result.defaultScheduleName,
        }),
      );
      setDeleteTarget(null);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.deleteFailed'), messageApi, t);
    }
  }

  function buildActionMenu(schedule: WorkSchedule): MenuProps['items'] {
    return [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`${LIST_PATH}/${schedule.id}/edit`),
      },
      {
        key: 'assign',
        icon: <UserAddOutlined />,
        label: t('hr.workSchedule.assign'),
        onClick: () => setAssignSchedule(schedule),
      },
      {
        key: 'default',
        icon: <StarOutlined />,
        label: t('hr.workSchedule.setDefault'),
        disabled: schedule.isDefault,
        onClick: () =>
          void defaultMutation
            .mutateAsync(schedule.id)
            .then(() =>
              messageApi.success(t('hr.workSchedule.defaultUpdated')),
            )
            .catch((error: unknown) =>
              notifyApiError(
                error,
                t('hr.workSchedule.saveFailed'),
                messageApi,
                t,
              ),
            ),
      },
      {
        key: 'deactivate',
        icon: <StopOutlined />,
        danger: true,
        label: t('hr.workSchedule.deactivate'),
        disabled: schedule.isDefault || !schedule.isActive,
        onClick: () =>
          void deactivateMutation
            .mutateAsync(schedule.id)
            .then(() =>
              messageApi.success(t('hr.workSchedule.deactivated')),
            )
            .catch((error: unknown) =>
              notifyApiError(
                error,
                t('hr.workSchedule.saveFailed'),
                messageApi,
                t,
              ),
            ),
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        danger: true,
        label: schedule.isDefault ? (
          <Tooltip title={t('hr.workSchedule.defaultCannotDelete')}>
            <span>{t('hr.workSchedule.delete')}</span>
          </Tooltip>
        ) : (
          t('hr.workSchedule.delete')
        ),
        disabled: schedule.isDefault,
        onClick: () => setDeleteTarget(schedule),
      },
    ];
  }

  if (!canViewHr) {
    return (
      <div className="flex flex-col gap-5 p-1">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AssignWorkScheduleModal
        open={Boolean(assignSchedule)}
        schedule={assignSchedule}
        onClose={() => setAssignSchedule(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('hr.workSchedule.deleteTitle')}
        description={t('hr.workSchedule.deleteDescription', {
          name: deleteTarget?.name ?? '',
          count: deleteTarget?.assignedEmployeeCount ?? 0,
        })}
        confirmLabel={t('hr.workSchedule.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-0"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('hr.workSchedule.loadError'),
            t,
          )}
        />
      ) : null}

      <div
        className={`grid gap-4 ${
          isCompact
            ? 'grid-cols-2'
            : 'grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <StatTile
          label={t('hr.workSchedule.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<CalendarClock size={18} strokeWidth={2} />}
          active={statusMode === 'all'}
          onClick={() => setStatusMode('all')}
        />
        <StatTile
          label={t('hr.workSchedule.stats.active')}
          value={statusCounts.active}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'active'}
          onClick={() => setStatusMode('active')}
        />
        <StatTile
          label={t('hr.workSchedule.stats.inactive')}
          value={statusCounts.inactive}
          accent="slate"
          icon={<StopOutlined />}
          active={statusMode === 'inactive'}
          onClick={() => setStatusMode('inactive')}
        />
        <StatTile
          label={t('hr.workSchedule.stats.default')}
          value={statusCounts.default}
          accent="amber"
          icon={<StarOutlined />}
          active={statusMode === 'default'}
          onClick={() => setStatusMode('default')}
        />
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <h3 className="m-0 text-base font-semibold text-slate-900">
              {t('pages.hr.workSchedules.listTitle')}
            </h3>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {filtered.length.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(`${LIST_PATH}/new`)}
            >
              {t('hr.workSchedule.new')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <Input
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('hr.workSchedule.searchPlaceholder')}
            prefix={<SearchOutlined className="text-slate-400" />}
            className="max-w-sm"
            aria-label={t('hr.workSchedule.searchPlaceholder')}
          />
          {hasFilters ? (
            <Button
              type="link"
              className="!px-1"
              onClick={() => {
                setSearch('');
                setStatusMode('all');
              }}
            >
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10">
            <TableEmptyState
              icon={<CalendarClock />}
              title={
                hasFilters
                  ? t('hr.workSchedule.emptyFiltered')
                  : t('hr.workSchedule.empty')
              }
              description={t('pages.hr.workSchedules.listDescription')}
              action={
                hasFilters
                  ? {
                      label: t('common.reset'),
                      onClick: () => {
                        setSearch('');
                        setStatusMode('all');
                      },
                    }
                  : {
                      label: t('hr.workSchedule.new'),
                      onClick: () => router.push(`${LIST_PATH}/new`),
                    }
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((schedule) => (
              <article
                key={schedule.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`${LIST_PATH}/${schedule.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`${LIST_PATH}/${schedule.id}`);
                  }
                }}
                className={`group flex cursor-pointer flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 transition-all hover:border-emerald-200 hover:bg-white hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  schedule.isActive ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="m-0 truncate text-[15px] font-semibold text-slate-900">
                        {schedule.name}
                      </h4>
                      {schedule.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                          <StarOutlined className="text-[10px]" />
                          {t('hr.workSchedule.defaultBadge')}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          schedule.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {schedule.isActive
                          ? t('common.active')
                          : t('common.inactive')}
                      </span>
                    </div>
                    {schedule.description ? (
                      <p className="mt-1.5 mb-0 line-clamp-2 text-[13px] leading-snug text-slate-500">
                        {schedule.description}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="shrink-0"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      trigger={['click']}
                      menu={{ items: buildActionMenu(schedule) }}
                      placement="bottomRight"
                      rootClassName="erp-row-actions-menu"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                        className="opacity-70 group-hover:opacity-100"
                        onClick={(event) => event.preventDefault()}
                      />
                    </Dropdown>
                  </div>
                </div>

                <WeekStrip days={schedule.days} t={t} />

                <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100">
                    <CalendarClock size={13} strokeWidth={2} aria-hidden />
                    {schedule.workingDaysPerWeek}{' '}
                    {t('hr.workSchedule.daysPerWeek')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100">
                    <Clock3 size={13} strokeWidth={2} aria-hidden />
                    {schedule.hoursPerWeek} {t('hr.workSchedule.hoursPerWeek')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100">
                    <Users size={13} strokeWidth={2} aria-hidden />
                    {schedule.assignedEmployeeCount}{' '}
                    {t('hr.workSchedule.employees')}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
