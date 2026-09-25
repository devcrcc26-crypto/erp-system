'use client';

import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  Popover,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceDailyLog,
  AttendanceDayFlag,
} from '@/lib/api/attendance.types';
import {
  useCorrectAttendanceDailyLog,
  useEmployeeAttendanceDailyLogs,
} from '@/lib/query/attendance';
import { formatUserName } from '@/lib/utils/user-display';

export interface AttendanceDailyLogsDrawerProps {
  employeeId: string | undefined;
  month: number;
  year: number;
  canCorrect: boolean;
  onClose: () => void;
}

const STATUS_COLORS = {
  PRESENT: 'success',
  ABSENT: 'error',
  HOLIDAY: 'processing',
  ON_LEAVE: 'purple',
  WEEKEND: 'default',
} as const;

const FLAG_COLORS: Record<Exclude<AttendanceDayFlag, 'NONE'>, string> = {
  MISSING_CLOCK_IN: 'error',
  MISSING_CLOCK_OUT: 'warning',
  EARLY_LEAVE: 'orange',
};

const FLAG_LABELS: Record<Exclude<AttendanceDayFlag, 'NONE'>, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure',
};

function FlagIcon({
  flag,
}: {
  flag: Exclude<AttendanceDayFlag, 'NONE'>;
}): React.ReactNode {
  switch (flag) {
    case 'MISSING_CLOCK_IN':
      return <CloseCircleOutlined />;
    case 'MISSING_CLOCK_OUT':
      return <ExclamationCircleOutlined />;
    case 'EARLY_LEAVE':
      return <ArrowLeftOutlined />;
    default:
      return null;
  }
}

function dayStatus(
  log: AttendanceDailyLog,
): 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'WEEKEND' {
  if (log.isHoliday) {
    return 'HOLIDAY';
  }
  if (log.isWeekend) {
    return 'WEEKEND';
  }
  if (log.wasPresent || log.correctedClockInLocal || log.clockInLocal) {
    return 'PRESENT';
  }
  return 'ABSENT';
}

function formatClockTime(time: string | null | undefined): React.ReactNode {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: time ? '#0f172a' : '#94a3b8',
      }}
    >
      {time ?? '—'}
    </span>
  );
}

function rowClassName(log: AttendanceDailyLog): string {
  if (log.isHoliday) {
    return 'attendance-row-holiday';
  }
  if (log.isWeekend) {
    return 'attendance-row-weekend';
  }
  if (dayStatus(log) === 'ABSENT') {
    return 'attendance-row-absent';
  }
  return '';
}

function CorrectPopover({
  log,
  onSaved,
}: {
  log: AttendanceDailyLog;
  onSaved: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{
    correctedClockInLocal?: string;
    correctedClockOutLocal?: string;
    correctionNote: string;
  }>();
  const correctMutation = useCorrectAttendanceDailyLog();

  async function handleSave(): Promise<void> {
    const values = await form.validateFields();
    try {
      await correctMutation.mutateAsync({
        dailyLogId: log.id,
        correctedClockInLocal: values.correctedClockInLocal || undefined,
        correctedClockOutLocal: values.correctedClockOutLocal || undefined,
        correctionNote: values.correctionNote,
      });
      message.success(t('pages.hr.attendance.review.correctSuccess'));
      setOpen(false);
      form.resetFields();
      onSaved();
    } catch (error) {
      message.error(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.review.actionFailed'),
      );
    }
  }

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={t('pages.hr.attendance.review.correctTitle')}
      content={
        <Form
          form={form}
          layout="vertical"
          className="w-64"
          initialValues={{
            correctedClockInLocal:
              log.correctedClockInLocal ?? log.clockInLocal ?? undefined,
            correctedClockOutLocal:
              log.correctedClockOutLocal ?? log.clockOutLocal ?? undefined,
          }}
        >
          <Form.Item
            name="correctedClockInLocal"
            label={t('pages.hr.attendance.review.correctedClockIn')}
            rules={[
              {
                pattern: /^\d{2}:\d{2}$/,
                message: t('pages.hr.attendance.review.timeFormat'),
              },
            ]}
          >
            <Input placeholder="HH:mm" />
          </Form.Item>
          <Form.Item
            name="correctedClockOutLocal"
            label={t('pages.hr.attendance.review.correctedClockOut')}
            rules={[
              {
                pattern: /^\d{2}:\d{2}$/,
                message: t('pages.hr.attendance.review.timeFormat'),
              },
            ]}
          >
            <Input placeholder="HH:mm" />
          </Form.Item>
          <Form.Item
            name="correctionNote"
            label={t('pages.hr.attendance.review.correctionNote')}
            rules={[
              {
                required: true,
                message: t('pages.hr.attendance.review.correctionNoteRequired'),
              },
              { min: 10 },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button
            type="primary"
            block
            loading={correctMutation.isPending}
            onClick={() => void handleSave()}
          >
            {t('pages.hr.attendance.review.saveCorrection')}
          </Button>
        </Form>
      }
    >
      <Button type="link" className="!px-0" size="small">
        {t('pages.hr.attendance.review.correct')}
      </Button>
    </Popover>
  );
}

/**
 * Day-by-day attendance drawer for one employee in the review month.
 */
export default function AttendanceDailyLogsDrawer({
  employeeId,
  month,
  year,
  canCorrect,
  onClose,
}: AttendanceDailyLogsDrawerProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const open = Boolean(employeeId);
  const query = useEmployeeAttendanceDailyLogs(
    employeeId,
    month,
    year,
    open,
  );

  const logs = query.data?.dailyLogs ?? [];
  const employee = query.data?.employee;
  const employeeName = employee ? formatUserName(employee) : '';
  const employeeCode = employee?.employeeId?.trim() || '—';
  const monthLabel = t(`hr.months.${month}`);
  const presentDays = Number(query.data?.presentDays ?? 0);
  const absentDays = Number(query.data?.absentDays ?? 0);

  const columns: ColumnsType<AttendanceDailyLog> = useMemo(
    () => [
      {
        title: t('pages.hr.attendance.daily.date'),
        key: 'date',
        width: 130,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const d = dayjs(row.date);
          return (
            <span>
              <span style={{ fontWeight: 500 }}>{d.format('ddd')}</span>
              <span style={{ color: '#64748b', marginLeft: 4 }}>
                {d.format('D MMM')}
              </span>
            </span>
          );
        },
      },
      {
        title: t('pages.hr.attendance.daily.status'),
        key: 'status',
        width: 110,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const status = dayStatus(row);
          return (
            <Tag color={STATUS_COLORS[status]}>
              {t(`pages.hr.attendance.review.dayStatus.${status}`)}
            </Tag>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.clockInLocal'),
        key: 'clockIn',
        width: 110,
        render: (_: unknown, row: AttendanceDailyLog) => (
          <span>
            {formatClockTime(
              row.correctedClockInLocal ?? row.clockInLocal,
            )}
            {row.correctedClockInLocal ? (
              <Typography.Text type="secondary" className="ml-1 text-xs">
                *
              </Typography.Text>
            ) : null}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.review.clockOutLocal'),
        key: 'clockOut',
        width: 110,
        render: (_: unknown, row: AttendanceDailyLog) => (
          <span>
            {formatClockTime(
              row.correctedClockOutLocal ?? row.clockOutLocal,
            )}
            {row.correctedClockOutLocal ? (
              <Typography.Text type="secondary" className="ml-1 text-xs">
                *
              </Typography.Text>
            ) : null}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.review.columns.flag'),
        key: 'flag',
        width: 200,
        render: (_: unknown, row: AttendanceDailyLog) => {
          if (row.flag === 'NONE') {
            return <span style={{ color: '#94a3b8' }}>—</span>;
          }
          if (row.flagResolved) {
            return (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                Resolved
              </Tag>
            );
          }
          return (
            <Tag
              color={FLAG_COLORS[row.flag]}
              icon={<FlagIcon flag={row.flag} />}
            >
              {FLAG_LABELS[row.flag]}
            </Tag>
          );
        },
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 100,
        render: (_: unknown, row: AttendanceDailyLog) => {
          if (!canCorrect || row.isWeekend || row.isHoliday) {
            return null;
          }
          return (
            <CorrectPopover
              log={row}
              onSaved={() => {
                void query.refetch();
              }}
            />
          );
        },
      },
    ],
    [canCorrect, query, t],
  );

  return (
    <Drawer
      title={
        <Space orientation="vertical" size={0}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {employeeName || t('pages.hr.attendance.review.dailyLogsTitle')}
          </span>
          {employeeName ? (
            <Typography.Text type="secondary" className="text-xs font-normal">
              {employeeCode} · {monthLabel} {year} · {presentDays} present ·{' '}
              {absentDays} absent
            </Typography.Text>
          ) : null}
        </Space>
      }
      open={open}
      onClose={onClose}
      size={920}
      destroyOnHidden
    >
      {query.isLoading && !query.data ? (
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      ) : (
        <DataTable<AttendanceDailyLog>
          className="erp-data-table erp-pro-table"
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={query.isFetching}
          size="small"
          scroll={{ x: 800, y: 'calc(100vh - 200px)' }}
          pagination={false}
          rowClassName={rowClassName}
        />
      )}
    </Drawer>
  );
}
