'use client';

import { useMemo } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import type { AttendanceRecord } from '@/lib/api/attendance.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const STAT_ACCENT = {
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
} as const;

type StatAccent = keyof typeof STAT_ACCENT;

export interface AttendanceStatBarProps {
  records: AttendanceRecord[];
  totalEmployees?: number;
  loading: boolean;
}

function AttendanceStat({
  label,
  value,
  subLabel,
  accent,
  icon,
}: {
  label: string;
  value: string;
  subLabel: string;
  accent: StatAccent;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat erp-contract-stat erp-contract-stat--static">
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value}</p>
        <p className="erp-att-stat-hint">{subLabel}</p>
      </div>
    </div>
  );
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toFixed(1).replace(/\.0$/, '');
}

/**
 * Summary chips for the loaded attendance period (4 floating cards).
 */
export default function AttendanceStatBar({
  records,
  totalEmployees,
  loading,
}: AttendanceStatBarProps): React.ReactNode {
  const { t } = useEpcTranslation();

  const stats = useMemo(() => {
    const totalPresent = records.reduce(
      (sum, row) => sum + Number(row.presentDays ?? 0),
      0,
    );
    const totalAbsent = records.reduce(
      (sum, row) => sum + Number(row.absentDays ?? 0),
      0,
    );
    const totalPayableHours = records.reduce(
      (sum, row) => sum + Number(row.payableHours ?? 0),
      0,
    );
    return {
      employees: totalEmployees ?? records.length,
      totalPresent,
      totalAbsent,
      totalPayableHours,
    };
  }, [records, totalEmployees]);

  if (loading) {
    return (
      <div className="erp-users-stat-bar">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="erp-users-stat">
            <Skeleton.Avatar active size={40} shape="square" />
            <div className="min-w-0 flex-1">
              <Skeleton.Input active size="small" style={{ width: 80 }} />
              <Skeleton.Input
                active
                size="small"
                style={{ width: 48, marginTop: 4 }}
              />
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
        subLabel={t('pages.hr.attendance.stats.employeesHint')}
        accent="blue"
        icon={<TeamOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.totalPresent')}
        value={stats.totalPresent.toLocaleString()}
        subLabel={t('pages.hr.attendance.stats.totalPresentHint')}
        accent="green"
        icon={<CheckCircleOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.totalAbsent')}
        value={stats.totalAbsent.toLocaleString()}
        subLabel={t('pages.hr.attendance.stats.totalAbsentHint')}
        accent="red"
        icon={<CloseCircleOutlined />}
      />
      <AttendanceStat
        label={t('pages.hr.attendance.stats.totalPayableHours')}
        value={formatHours(stats.totalPayableHours)}
        subLabel={t('pages.hr.attendance.stats.totalPayableHoursHint')}
        accent="teal"
        icon={<FieldTimeOutlined />}
      />
    </div>
  );
}
