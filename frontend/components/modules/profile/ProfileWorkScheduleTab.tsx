'use client';

import { useMemo } from 'react';
import { Alert, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarClock, CalendarOff } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  MyUpcomingHoliday,
  WorkScheduleDay,
} from '@/lib/api/work-schedule.types';
import { useMyUpcomingHolidays, useMyWorkSchedule } from '@/lib/query/work-schedule';
import { formatDateWithPattern } from '@/lib/utils/date-format';
import {
  ProfileEmptyState,
  ProfileSection,
  displayText,
} from '@/components/modules/profile/profile-display';

const UPCOMING_DAYS = 60;
/** Monday-first display order (dayOfWeek: 0 = Sunday … 6 = Saturday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type DayStatus = 'working' | 'half' | 'off';

const STATUS_DOT: Record<DayStatus, string> = {
  working: '#1d9e75',
  half: '#ba7517',
  off: '#94a3b8',
};

function dayStatus(day: WorkScheduleDay): DayStatus {
  if (!day.isWorkingDay) {
    return 'off';
  }
  return day.isHalfDay ? 'half' : 'working';
}

function timeRange(start: string | null, end: string | null): string {
  return start && end ? `${start} – ${end}` : '-';
}

/**
 * My Profile → Work Schedule: the employee's active schedule and the public
 * holidays that apply to them in the next 60 days.
 */
export default function ProfileWorkScheduleTab({
  dateFormat,
}: {
  dateFormat: string | null | undefined;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const scheduleQuery = useMyWorkSchedule();
  const holidaysQuery = useMyUpcomingHolidays(UPCOMING_DAYS);
  const schedule = scheduleQuery.data ?? null;

  const days = useMemo((): WorkScheduleDay[] => {
    if (!schedule) {
      return [];
    }
    return WEEK_ORDER.map((dow) =>
      schedule.days.find((day) => day.dayOfWeek === dow),
    ).filter((day): day is WorkScheduleDay => day !== undefined);
  }, [schedule]);

  const statusLabel: Record<DayStatus, string> = {
    working: t('profile.scheduleWorking'),
    half: t('profile.scheduleHalfDay'),
    off: t('profile.scheduleOff'),
  };

  const dayColumns: ColumnsType<WorkScheduleDay> = [
    {
      title: t('profile.scheduleDay'),
      dataIndex: 'dayOfWeek',
      key: 'day',
      render: (value: number) => (
        <span className="erp-users-cell-strong">{t(`profile.weekday.${value}`)}</span>
      ),
    },
    {
      title: t('profile.scheduleStatus'),
      key: 'status',
      render: (_: unknown, day: WorkScheduleDay) => {
        const status = dayStatus(day);
        return (
          <span className="erp-users-status">
            <span
              className="erp-users-status-dot"
              style={{ background: STATUS_DOT[status] }}
              aria-hidden
            />
            {statusLabel[status]}
          </span>
        );
      },
    },
    {
      title: t('profile.scheduleMorning'),
      key: 'morning',
      render: (_: unknown, day: WorkScheduleDay) => (
        <span className="erp-users-cell-sub tabular-nums">
          {day.isWorkingDay ? timeRange(day.morningStart, day.morningEnd) : '-'}
        </span>
      ),
    },
    {
      title: t('profile.scheduleAfternoon'),
      key: 'afternoon',
      render: (_: unknown, day: WorkScheduleDay) => (
        <span className="erp-users-cell-sub tabular-nums">
          {day.isWorkingDay && !day.isHalfDay
            ? timeRange(day.afternoonStart, day.afternoonEnd)
            : '-'}
        </span>
      ),
    },
    {
      title: t('profile.scheduleTotalHours'),
      dataIndex: 'totalHours',
      key: 'totalHours',
      align: 'right',
      render: (value: number, day: WorkScheduleDay) => (
        <span className="erp-users-cell-strong tabular-nums">
          {day.isWorkingDay ? Number(value).toFixed(1) : '-'}
        </span>
      ),
    },
  ];

  function daysUntilLabel(daysUntil: number): string {
    if (daysUntil === 0) {
      return t('profile.holidayToday');
    }
    if (daysUntil === 1) {
      return t('profile.holidayTomorrow');
    }
    return t('profile.holidayInDays', { count: daysUntil });
  }

  const holidayColumns: ColumnsType<MyUpcomingHoliday> = [
    {
      title: t('profile.holidayName'),
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, holiday: MyUpcomingHoliday) => {
        const primary =
          locale === 'zh' && holiday.nameZh ? holiday.nameZh : holiday.name;
        const secondary =
          locale === 'zh' ? (holiday.nameZh ? holiday.name : null) : holiday.nameZh;
        return (
          <div className="flex flex-col">
            <span className="erp-users-cell-strong">{displayText(primary)}</span>
            {secondary ? <span className="erp-users-cell-sub">{secondary}</span> : null}
          </div>
        );
      },
    },
    {
      title: t('profile.holidayDate'),
      dataIndex: 'date',
      key: 'date',
      render: (value: string) => (
        <span className="erp-users-cell-strong tabular-nums">
          {formatDateWithPattern(value, dateFormat)}
        </span>
      ),
    },
    {
      title: t('profile.holidayAppliesTo'),
      dataIndex: 'appliesToNationality',
      key: 'appliesTo',
      render: (value: MyUpcomingHoliday['appliesToNationality']) => (
        <span className="erp-users-cell-sub">
          {value === 'ALL' ? t('profile.holidayAppliesAll') : t(`hr.nationality.${value}`)}
        </span>
      ),
    },
    {
      title: t('profile.holidayDaysUntil'),
      dataIndex: 'daysUntil',
      key: 'daysUntil',
      align: 'right',
      render: (value: number) => (
        <span className="erp-users-cell-strong">{daysUntilLabel(value)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ProfileSection
        title={t('profile.scheduleTitle')}
        extra={
          schedule?.isDefault ? (
            <StatusBadge label={t('profile.scheduleDefault')} variant="info" />
          ) : null
        }
        bodyClassName={schedule ? '!p-0' : ''}
      >
        {scheduleQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : scheduleQuery.isError ? (
          <Alert type="error" showIcon title={t('profile.scheduleLoadError')} />
        ) : !schedule ? (
          <ProfileEmptyState
            icon={<CalendarClock size={22} strokeWidth={1.6} />}
            message={t('profile.noSchedule')}
          />
        ) : (
          <>
            <div className="px-4 pb-3 pt-4">
              <p className="erp-users-name m-0">{schedule.name}</p>
              {schedule.description ? (
                <p className="erp-users-cell-sub m-0 mt-1">{schedule.description}</p>
              ) : null}
              <p className="erp-users-cell-sub m-0 mt-1">
                {t('profile.scheduleWeeklyHours', { hours: schedule.hoursPerWeek })}
              </p>
            </div>
            <DataTable<WorkScheduleDay>
              rowKey="dayOfWeek"
              size="small"
              className="erp-pro-table erp-users-table erp-leave-history-table"
              columns={dayColumns}
              dataSource={days}
              pagination={false}
            />
          </>
        )}
      </ProfileSection>

      <ProfileSection title={t('profile.upcomingHolidays')} bodyClassName="erp-employee-section-body--flush">
        {holidaysQuery.isError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={t('profile.holidaysLoadError')} />
          </div>
        ) : (
          <DataTable<MyUpcomingHoliday>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table erp-leave-history-table"
            loading={holidaysQuery.isLoading}
            columns={holidayColumns}
            dataSource={holidaysQuery.data ?? []}
            pagination={false}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarOff size={28} strokeWidth={1.5} />}
                  title={t('profile.noUpcomingHolidays')}
                />
              ),
            }}
          />
        )}
      </ProfileSection>
    </div>
  );
}
