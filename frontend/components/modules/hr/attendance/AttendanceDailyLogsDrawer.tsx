'use client';

import { useMemo, useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Spin,
  Tag,
  TimePicker,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
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

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
] as const;

const STATUS_CONFIG: Record<
  NonNullable<AttendanceDailyLog['dayStatus']>,
  { color: string; labelKey: string }
> = {
  PRESENT: { color: 'success', labelKey: 'PRESENT' },
  ABSENT: { color: 'error', labelKey: 'ABSENT' },
  HALF_ABSENT: { color: 'warning', labelKey: 'HALF_ABSENT' },
  SUNDAY: { color: 'default', labelKey: 'SUNDAY' },
  HOLIDAY: { color: 'processing', labelKey: 'HOLIDAY' },
  WORK_FROM_HOME: { color: 'cyan', labelKey: 'WORK_FROM_HOME' },
  ON_SITE: { color: 'geekblue', labelKey: 'ON_SITE' },
  LEAVE: { color: 'purple', labelKey: 'LEAVE' },
  FIELD_MOVEMENT_PENDING: {
    color: 'orange',
    labelKey: 'FIELD_MOVEMENT_PENDING',
  },
};

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

function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function resolveDayStatus(
  log: AttendanceDailyLog,
): NonNullable<AttendanceDailyLog['dayStatus']> {
  if (log.dayStatus) {
    return log.dayStatus;
  }
  if (log.isHoliday) {
    return 'HOLIDAY';
  }
  if (log.isWeekend) {
    return 'SUNDAY';
  }
  if (log.wasPresent || log.correctedClockInLocal || log.clockInLocal) {
    return 'PRESENT';
  }
  return 'ABSENT';
}

function formatClockCell(
  original: string | null | undefined,
  corrected: string | null | undefined,
): React.ReactNode {
  if (corrected) {
    return (
      <div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--color-teal-600)',
            letterSpacing: '0.02em',
          }}
        >
          {corrected}
        </span>
        {original ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              marginLeft: 6,
              textDecoration: 'line-through',
            }}
          >
            {original}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: original
          ? 'var(--color-text-primary)'
          : 'var(--color-text-tertiary)',
        letterSpacing: '0.02em',
      }}
    >
      {original ?? '—'}
    </span>
  );
}

function rowClassName(log: AttendanceDailyLog): string {
  if (log.isHoliday) {
    return 'erp-attendance-row-holiday';
  }
  if (log.isWeekend) {
    return 'erp-attendance-row-weekend';
  }
  if (dayStatus(log) === 'ABSENT') {
    return 'erp-attendance-row-absent';
  }
  return '';
}

function parseTimeValue(value: string | null | undefined): Dayjs | undefined {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return undefined;
  }
  const [hoursText, minutesText] = value.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }
  return dayjs().hour(hours).minute(minutes).second(0).millisecond(0);
}

function formatTimeValue(value: Dayjs | null | undefined): string | undefined {
  if (!value || !value.isValid()) {
    return undefined;
  }
  return value.format('HH:mm');
}

function CorrectModal({
  log,
  onSaved,
}: {
  log: AttendanceDailyLog;
  onSaved: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="default"
        size="small"
        icon={<EditOutlined />}
        onClick={() => setOpen(true)}
      >
        {t('pages.hr.attendance.review.correct')}
      </Button>
      {open ? (
        <CorrectModalBody
          log={log}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function CorrectModalBody({
  log,
  open,
  onClose,
  onSaved,
}: {
  log: AttendanceDailyLog;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    correctedClockInLocal?: Dayjs | null;
    correctedClockOutLocal?: Dayjs | null;
    correctionNote: string;
  }>();
  const correctMutation = useCorrectAttendanceDailyLog();

  async function handleSave(): Promise<void> {
    const values = await form.validateFields();
    try {
      await correctMutation.mutateAsync({
        dailyLogId: log.id,
        correctedClockInLocal: formatTimeValue(values.correctedClockInLocal),
        correctedClockOutLocal: formatTimeValue(values.correctedClockOutLocal),
        correctionNote: values.correctionNote,
      });
      message.success(t('pages.hr.attendance.review.correctSuccess'));
      onClose();
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
    <Modal
      title={t('pages.hr.attendance.review.correctTitle')}
      open={open}
      onCancel={onClose}
      onOk={() => void handleSave()}
      confirmLoading={correctMutation.isPending}
      okText={t('pages.hr.attendance.review.saveCorrection')}
      cancelText={t('common.cancel')}
      destroyOnHidden
      centered
      width={420}
      styles={{
        body: { paddingTop: 12 },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          correctedClockInLocal: parseTimeValue(
            log.correctedClockInLocal ?? log.clockInLocal,
          ),
          correctedClockOutLocal: parseTimeValue(
            log.correctedClockOutLocal ?? log.clockOutLocal,
          ),
          correctionNote: '',
        }}
      >
        <Form.Item
          name="correctedClockInLocal"
          label={t('pages.hr.attendance.review.correctedClockIn')}
        >
          <TimePicker
            className="w-full"
            format="HH:mm"
            needConfirm={false}
            showNow={false}
            placeholder="HH:mm"
            getPopupContainer={(node) => node.parentElement ?? document.body}
          />
        </Form.Item>
        <Form.Item
          name="correctedClockOutLocal"
          label={t('pages.hr.attendance.review.correctedClockOut')}
        >
          <TimePicker
            className="w-full"
            format="HH:mm"
            needConfirm={false}
            showNow={false}
            placeholder="HH:mm"
            getPopupContainer={(node) => node.parentElement ?? document.body}
          />
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
      </Form>
    </Modal>
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
  const scheduledDays = Number(query.data?.scheduledDays ?? 0);
  const presentDays = Number(query.data?.presentDays ?? 0);
  const absentDays = Number(query.data?.absentDays ?? 0);
  const flaggedDays = Number(query.data?.flaggedDays ?? 0);
  const resolvedDays = Number(query.data?.resolvedDays ?? 0);

  const miniStats = [
    { label: 'Scheduled', value: scheduledDays },
    { label: 'Present', value: presentDays },
    { label: 'Absent', value: absentDays, alert: absentDays > 0 },
    { label: 'Flagged', value: flaggedDays, alert: flaggedDays > 0 },
    { label: 'Resolved', value: resolvedDays },
  ] as const;

  const columns: ColumnsType<AttendanceDailyLog> = useMemo(
    () => [
      {
        title: t('pages.hr.attendance.daily.date'),
        key: 'date',
        width: 130,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const d = dayjs(row.date);
          return (
            <div>
              <span
                style={{
                  fontWeight: 600,
                  color:
                    row.isWeekend || row.isHoliday
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-primary)',
                }}
              >
                {d.format('ddd')}
              </span>
              <span
                style={{
                  color: 'var(--color-text-tertiary)',
                  marginLeft: 4,
                  fontSize: 12,
                }}
              >
                {d.format('D MMM')}
              </span>
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.daily.status'),
        key: 'status',
        width: 150,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const status = resolveDayStatus(row);
          const config = STATUS_CONFIG[status];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Tag
                color={config.color}
                style={{ borderRadius: 999, fontWeight: 500, margin: 0 }}
              >
                {t(`pages.hr.attendance.review.dayStatus.${config.labelKey}`)}
                {row.holidayName ? (
                  <span style={{ fontWeight: 400, marginLeft: 4 }}>
                    ({row.holidayName})
                  </span>
                ) : null}
              </Tag>
              {status === 'HALF_ABSENT' ? (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  No field movement log
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.daily.deduction'),
        key: 'deduction',
        width: 90,
        align: 'right',
        render: (_: unknown, row: AttendanceDailyLog) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.dayDeduction ?? 0}
          </span>
        ),
      },
      {
        title: t('pages.hr.attendance.review.clockInLocal'),
        key: 'clockIn',
        width: 130,
        render: (_: unknown, row: AttendanceDailyLog) =>
          formatClockCell(row.clockInLocal, row.correctedClockInLocal),
      },
      {
        title: t('pages.hr.attendance.review.clockOutLocal'),
        key: 'clockOut',
        width: 130,
        render: (_: unknown, row: AttendanceDailyLog) =>
          formatClockCell(row.clockOutLocal, row.correctedClockOutLocal),
      },
      {
        title: t('pages.hr.attendance.review.columns.flag'),
        key: 'flag',
        width: 200,
        render: (_: unknown, row: AttendanceDailyLog) => {
          if (row.flag === 'NONE') {
            return (
              <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
            );
          }
          if (row.flagResolved) {
            return (
              <Tag
                icon={<CheckCircleOutlined />}
                color="success"
                style={{ borderRadius: 999 }}
              >
                Resolved
              </Tag>
            );
          }
          const pendingEntry = row.fieldMovementEntries?.find(
            (entry) =>
              entry.log?.status === 'SUBMITTED' ||
              entry.log?.status === 'IN_REVIEW' ||
              entry.log?.status === 'APPROVED',
          );
          return (
            <Tooltip
              title={
                pendingEntry
                  ? `Explained: ${pendingEntry.reason}`
                  : 'No explanation submitted yet'
              }
            >
              <Tag
                color={FLAG_COLORS[row.flag]}
                icon={<FlagIcon flag={row.flag} />}
                style={{ borderRadius: 999, cursor: 'default' }}
              >
                {FLAG_LABELS[row.flag]}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 120,
        render: (_: unknown, row: AttendanceDailyLog) => {
          if (!canCorrect || row.isWeekend || row.isHoliday) {
            return null;
          }
          return (
            <CorrectModal
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
      className="erp-attendance-daily-drawer"
      closable
      title={
        employee ? (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 4,
                paddingRight: 28,
              }}
            >
              <Avatar
                size={40}
                style={{
                  background: avatarColor(employee.id),
                  borderRadius: 10,
                  flexShrink: 0,
                }}
              >
                {initialsOf(employee.firstName, employee.lastName)}
              </Avatar>
              <div>
                <div
                  style={{
                    fontWeight: 650,
                    fontSize: 15,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {employeeName}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <span className="erp-users-id-chip">{employeeCode}</span>
                  <span
                    style={{
                      color: 'var(--color-text-tertiary)',
                      fontSize: 12,
                    }}
                  >
                    {monthLabel} {year}
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--color-surface-secondary)',
                borderRadius: 8,
                border: '1px solid var(--color-border-tertiary)',
              }}
            >
              {miniStats.map((stat) => (
                <div key={stat.label} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color:
                        'alert' in stat && stat.alert
                          ? stat.label === 'Absent'
                            ? 'var(--color-red-400)'
                            : 'var(--color-amber-400)'
                          : 'var(--color-text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-tertiary)',
                      marginTop: 2,
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          t('pages.hr.attendance.review.dailyLogsTitle')
        )
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
          scroll={{ x: 800, y: 'calc(100vh - 260px)' }}
          pagination={false}
          rowClassName={rowClassName}
        />
      )}
    </Drawer>
  );
}
