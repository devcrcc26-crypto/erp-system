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
import dayjs from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceDailyLog,
} from '@/lib/api/attendance.types';
import {
  useCorrectAttendanceDailyLog,
  useEmployeeAttendanceDailyLogs,
} from '@/lib/query/attendance';
import {
  attendanceFlagTagColor,
  formatAttendanceDayFlag,
} from '@/lib/utils/attendance-flag-display';
import { formatUserName } from '@/lib/utils/user-display';

export interface AttendanceDailyLogsDrawerProps {
  employeeId: string | undefined;
  month: number;
  year: number;
  canCorrect: boolean;
  onClose: () => void;
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

function statusColor(
  status: ReturnType<typeof dayStatus>,
): string {
  switch (status) {
    case 'PRESENT':
      return 'green';
    case 'ABSENT':
      return 'red';
    case 'HOLIDAY':
      return 'purple';
    case 'WEEKEND':
      return 'default';
    default:
      return 'default';
  }
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
  const employeeName = query.data?.employee
    ? formatUserName(query.data.employee)
    : '';

  const columns: ColumnsType<AttendanceDailyLog> = useMemo(
    () => [
      {
        title: t('pages.hr.attendance.daily.date'),
        key: 'date',
        width: 120,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const d = dayjs(row.date);
          return (
            <span className="erp-users-cell-sub">
              {d.format('MMM D')} ({d.format('ddd')})
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
            <Tag color={statusColor(status)}>
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
          <span className="erp-users-cell-sub">
            {row.correctedClockInLocal ?? row.clockInLocal ?? '—'}
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
          <span className="erp-users-cell-sub">
            {row.correctedClockOutLocal ?? row.clockOutLocal ?? '—'}
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
        width: 220,
        render: (_: unknown, row: AttendanceDailyLog) => (
          <Tag color={attendanceFlagTagColor(row)}>
            {formatAttendanceDayFlag(row)}
          </Tag>
        ),
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
        <Space direction="vertical" size={0}>
          <span>{t('pages.hr.attendance.review.dailyLogsTitle')}</span>
          {employeeName ? (
            <Typography.Text type="secondary" className="text-sm font-normal">
              {employeeName}
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
        />
      )}
    </Drawer>
  );
}
