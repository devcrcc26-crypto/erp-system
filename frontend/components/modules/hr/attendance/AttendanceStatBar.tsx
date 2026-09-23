'use client';

import { useMemo } from 'react';
import {
  CalendarOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import type { AttendanceRecord } from '@/lib/api/attendance.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const STAT_ACCENT = {
  blue: { bg: '#E8F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

type StatAccent = keyof typeof STAT_ACCENT;

export interface AttendanceStatBarProps {
  records: AttendanceRecord[];
  /** Total matching employees from the list API (not just the current page). */
  totalEmployees?: number;
  loading: boolean;
}

function AttendanceStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: StatAccent;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat">
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
    </div>
  );
}

function avgRateAccent(rate: number | null): StatAccent {
  if (rate == null) {
    return 'blue';
  }
  if (rate >= 90) {
    return 'green';
  }
  if (rate >= 75) {
    return 'amber';
  }
  return 'red';
}

/**
 * Summary chips for the loaded attendance page (computed from current rows).
 */
export default function AttendanceStatBar({
  records,
  totalEmployees,
  loading,
}: AttendanceStatBarProps): React.ReactNode {
  const { t } = useEpcTranslation();

  const stats = useMemo(() => {
    const rates = records
      .map((row) => row.attendanceRate)
      .filter((rate): rate is number => rate != null);
    const avgRate =
      rates.length > 0
        ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length)
        : null;
    const totalLate = records.reduce((sum, row) => sum + (row.lateCount ?? 0), 0);
    const totalAbsent = records.reduce(
      (sum, row) => sum + Number(row.absentDays ?? 0),
      0,
    );
    return {
      employees: totalEmployees ?? records.length,
      avgRate,
      totalLate,
      totalAbsent,
    };
  }, [records, totalEmployees]);

  if (loading) {
    return (
      <div className="erp-users-stat-bar">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="erp-users-stat">
            <Skeleton.Avatar active size={36} shape="square" />
            <div className="min-w-0 flex-1">
              <Skeleton.Input active size="small" style={{ width: 80 }} />
              <Skeleton.Input active size="small" style={{ width: 48, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="erp-users-stat-bar">
      <AttendanceStat
        label={t('pages.hr.attendance.stats.employees')}
        value={stats.employees.toLocaleString()}
        accent="blue"
        icon={<TeamOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.avgAttendance')}
        value={stats.avgRate != null ? `${stats.avgRate}%` : '—'}
        accent={avgRateAccent(stats.avgRate)}
        icon={<CalendarOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.totalLate')}
        value={stats.totalLate.toLocaleString()}
        accent="amber"
        icon={<ClockCircleOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.totalAbsent')}
        value={stats.totalAbsent.toLocaleString()}
        accent="red"
        icon={<CloseCircleOutlined />}
      />
    </div>
  );
}
