'use client';

import './attendance-v2.css';

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
import { EditOutlined } from '@ant-design/icons';
import { CheckCircle2, LogIn, LogOut, TimerOff } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceDailyLog,
  AttendanceDayFlag,
} from '@/lib/api/attendance.types';
import {
  DRAWER_WIDTH_SUBMITTAL,
  detailDrawerStyles,
} from '@/lib/theme/layout';
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

type DayStatus = NonNullable<AttendanceDailyLog['dayStatus']>;
type DayFlag = Exclude<AttendanceDayFlag, 'NONE'>;

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
] as const;

const STATUS_CONFIG: Record<DayStatus, { color: string; labelKey: string }> = {
  PRESENT: { color: 'success', labelKey: 'PRESENT' },
  ABSENT: { color: 'error', labelKey: 'ABSENT' },
  HALF_ABSENT: { color: 'warning', labelKey: 'HALF_ABSENT' },
  SUNDAY: { color: 'default', labelKey: 'DAY_OFF' },
  DAY_OFF: { color: 'default', labelKey: 'DAY_OFF' },
  WORKED_ON_DAY_OFF: { color: 'cyan', labelKey: 'WORKED_ON_DAY_OFF' },
  HOLIDAY: { color: 'processing', labelKey: 'HOLIDAY' },
  WORK_FROM_HOME: { color: 'cyan', labelKey: 'WORK_FROM_HOME' },
  ON_SITE: { color: 'geekblue', labelKey: 'ON_SITE' },
  LEAVE: { color: 'purple', labelKey: 'LEAVE' },
  UNPAID_LEAVE: { color: 'error', labelKey: 'UNPAID_LEAVE' },
  FIELD_MOVEMENT_PENDING: {
    color: 'orange',
    labelKey: 'FIELD_MOVEMENT_PENDING',
  },
  ENROLMENT_GRACE: { color: 'blue', labelKey: 'ENROLMENT_GRACE' },
  NOT_EMPLOYED: { color: 'default', labelKey: 'NOT_EMPLOYED' },
  INACTIVE: { color: 'orange', labelKey: 'INACTIVE' },
};

/** Days where nobody is expected at the clock, so missing punches are not flagged. */
const NO_PUNCH_EXPECTED = new Set<DayStatus>([
  'NOT_EMPLOYED',
  'INACTIVE',
  'SUNDAY',
  'DAY_OFF',
  'WORKED_ON_DAY_OFF',
  'HOLIDAY',
  'LEAVE',
  'UNPAID_LEAVE',
  'WORK_FROM_HOME',
  'ON_SITE',
  'ENROLMENT_GRACE',
]);

const FLAG_CONFIG: Record<
  DayFlag,
  { labelKey: string; className: string; icon: React.ReactNode }
> = {
  MISSING_CLOCK_IN: {
    labelKey: 'pages.hr.attendance.dailyDrawer.flagMissingClockIn',
    className: 'bg-red-50 text-red-700 ring-red-200',
    icon: <LogIn size={12} strokeWidth={2.25} />,
  },
  MISSING_CLOCK_OUT: {
    labelKey: 'pages.hr.attendance.dailyDrawer.flagMissingClockOut',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    icon: <LogOut size={12} strokeWidth={2.25} />,
  },
  EARLY_LEAVE: {
    labelKey: 'pages.hr.attendance.dailyDrawer.flagEarlyLeave',
    className: 'bg-orange-50 text-orange-800 ring-orange-200',
    icon: <TimerOff size={12} strokeWidth={2.25} />,
  },
  ON_LEAVE_BUT_SCANNED: {
    labelKey: 'pages.hr.attendance.dailyDrawer.flagOnLeaveButScanned',
    className: 'bg-violet-50 text-violet-800 ring-violet-200',
    icon: <LogIn size={12} strokeWidth={2.25} />,
  },
  SCAN_AFTER_SEPARATION: {
    labelKey: 'pages.hr.attendance.dailyDrawer.flagScanAfterSeparation',
    className: 'bg-slate-100 text-slate-700 ring-slate-300',
    icon: <LogIn size={12} strokeWidth={2.25} />,
  },
};

const CARD_SHADOW =
  'shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]';

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

function resolveDayStatus(log: AttendanceDailyLog): DayStatus {
  if (log.dayStatus) {
    return log.dayStatus;
  }
  if (log.isHoliday) {
    return 'HOLIDAY';
  }
  if (log.isWeekend) {
    return 'DAY_OFF';
  }
  if (log.wasPresent || log.correctedClockInLocal || log.clockInLocal) {
    return 'PRESENT';
  }
  return 'ABSENT';
}

/**
 * Flags shown for a day: the stored review flag (which carries the resolved
 * state) plus any missing clock-in / clock-out on a day the employee was
 * expected at the clock, judged from the effective (corrected) times. The
 * stored flag holds one value, so a day missing both punches shows both here.
 */
function resolveDayFlags(
  log: AttendanceDailyLog,
): Array<{ flag: DayFlag; resolved: boolean }> {
  const stored = log.flag === 'NONE' ? null : log.flag;
  const expected =
    !log.isWeekend &&
    !log.isHoliday &&
    !NO_PUNCH_EXPECTED.has(resolveDayStatus(log));
  const clockIn = log.correctedClockInLocal ?? log.clockInLocal;
  const clockOut = log.correctedClockOutLocal ?? log.clockOutLocal;
  const flags: Array<{ flag: DayFlag; resolved: boolean }> = [];
  const push = (flag: DayFlag): void => {
    flags.push({ flag, resolved: stored === flag && log.flagResolved });
  };

  if (stored === 'MISSING_CLOCK_IN' || (expected && !clockIn)) {
    push('MISSING_CLOCK_IN');
  }
  if (
    stored === 'MISSING_CLOCK_OUT' ||
    (expected && !clockOut && !log.isLastExportDay)
  ) {
    push('MISSING_CLOCK_OUT');
  }
  if (stored === 'EARLY_LEAVE') {
    push('EARLY_LEAVE');
  }
  if (stored === 'ON_LEAVE_BUT_SCANNED') {
    push('ON_LEAVE_BUT_SCANNED');
  }
  if (stored === 'SCAN_AFTER_SEPARATION') {
    push('SCAN_AFTER_SEPARATION');
  }
  return flags;
}

function rowClassName(log: AttendanceDailyLog): string {
  if (log.isHoliday) {
    return 'erp-attendance-row-holiday';
  }
  if (log.isWeekend) {
    return 'erp-attendance-row-weekend';
  }
  if (resolveDayStatus(log) === 'ABSENT') {
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

function ClockCell({
  original,
  corrected,
}: {
  original: string | null | undefined;
  corrected: string | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  if (corrected) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[13px] font-semibold text-emerald-700 tabular-nums">
          {corrected}
        </span>
        {original ? (
          <span className="text-xs text-slate-500">
            {t('pages.hr.attendance.dailyDrawer.correctedFrom', {
              time: original,
            })}
          </span>
        ) : null}
      </div>
    );
  }
  if (!original) {
    return <span className="text-slate-400">-</span>;
  }
  return (
    <span className="font-mono text-[13px] text-slate-900 tabular-nums">
      {original}
    </span>
  );
}

function FlagPill({
  flag,
  resolved,
  tooltip,
}: {
  flag: DayFlag;
  resolved: boolean;
  tooltip: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const config = FLAG_CONFIG[flag];
  const label = t(config.labelKey);
  return (
    <Tooltip title={tooltip}>
      <span
        tabIndex={0}
        className={`inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600 ${
          resolved ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : config.className
        }`}
      >
        <span aria-hidden className="inline-flex">
          {resolved ? <CheckCircle2 size={12} strokeWidth={2.25} /> : config.icon}
        </span>
        {resolved
          ? t('pages.hr.attendance.dailyDrawer.flagResolved', { flag: label })
          : label}
      </span>
    </Tooltip>
  );
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
        className="!rounded-lg"
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
      rootClassName="erp-att-correct-modal"
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
  const employeeCode = employee?.employeeId?.trim() || '-';
  const periodLabel = t('pages.hr.attendance.dailyDrawer.period', {
    month: t(`hr.months.${month}`),
    year,
  });
  const absentDays = Number(query.data?.absentDays ?? 0);
  const flaggedDays = Number(query.data?.flaggedDays ?? 0);

  const stats = [
    {
      key: 'scheduled',
      label: t('pages.hr.attendance.dailyDrawer.statScheduled'),
      value: Number(query.data?.scheduledDays ?? 0),
      tone: 'text-slate-900',
    },
    {
      key: 'present',
      label: t('pages.hr.attendance.dailyDrawer.statPresent'),
      value: Number(query.data?.presentDays ?? 0),
      tone: 'text-emerald-700',
    },
    {
      key: 'absent',
      label: t('pages.hr.attendance.dailyDrawer.statAbsent'),
      value: absentDays,
      tone: absentDays > 0 ? 'text-red-700' : 'text-slate-900',
    },
    {
      key: 'flagged',
      label: t('pages.hr.attendance.dailyDrawer.statFlagged'),
      value: flaggedDays,
      tone: flaggedDays > 0 ? 'text-amber-700' : 'text-slate-900',
    },
    {
      key: 'resolved',
      label: t('pages.hr.attendance.dailyDrawer.statResolved'),
      value: Number(query.data?.resolvedDays ?? 0),
      tone: 'text-slate-900',
    },
  ];

  const columns: ColumnsType<AttendanceDailyLog> = useMemo(
    () => [
      {
        title: t('pages.hr.attendance.daily.date'),
        key: 'date',
        width: 84,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const d = dayjs(row.date);
          const muted = row.isWeekend || row.isHoliday;
          return (
            <div className="flex flex-col leading-tight">
              <span
                className={`text-xs font-medium tracking-wide uppercase ${
                  muted ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {d.format('ddd')}
              </span>
              <span
                className={`text-[13px] font-semibold ${
                  muted ? 'text-slate-500' : 'text-slate-900'
                }`}
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
        width: 140,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const status = resolveDayStatus(row);
          const config = STATUS_CONFIG[status];
          return (
            <div className="flex flex-col items-start gap-1">
              <Tag color={config.color} className="!m-0 !rounded-full !px-2">
                {status === 'ON_SITE' &&
                (row.correctedClockInLocal ?? row.clockInLocal)
                  ? t('pages.hr.attendance.review.dayStatus.onSiteScannedIn', {
                      time:
                        row.correctedClockInLocal ?? row.clockInLocal ?? '',
                    })
                  : status === 'ON_SITE' && row.siteAssignmentName
                    ? t('pages.hr.attendance.review.dayStatus.onSiteAt', {
                        siteName: row.siteAssignmentName,
                      })
                    : t(
                        `pages.hr.attendance.review.dayStatus.${config.labelKey}`,
                      )}
              </Tag>
              {row.holidayName ? (
                <span className="text-xs text-slate-600">{row.holidayName}</span>
              ) : null}
              {status === 'ON_SITE' &&
              row.siteAssignmentName &&
              (row.correctedClockInLocal ?? row.clockInLocal) ? (
                <span className="text-xs text-slate-600">
                  {row.siteAssignmentName}
                </span>
              ) : null}
              {status === 'HALF_ABSENT' ? (
                <span className="text-xs text-slate-600">
                  {t('pages.hr.attendance.dailyDrawer.noFieldMovement')}
                </span>
              ) : null}
              {row.earlyDepartureBand === 'PENDING_APPROVAL' ? (
                <span className="text-xs text-amber-700">
                  {t('pages.hr.attendance.review.earlyDeparturePending')}
                </span>
              ) : null}
              {Number(row.earlyDepartureWouldDeduct ?? 0) > 0 &&
              Number(row.dayDeduction ?? 0) === 0 ? (
                <span className="text-xs text-amber-700">
                  {t('pages.hr.attendance.review.wouldDeduct', {
                    days: Number(row.earlyDepartureWouldDeduct),
                  })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.review.clockInLocal'),
        key: 'clockIn',
        width: 110,
        render: (_: unknown, row: AttendanceDailyLog) => (
          <ClockCell
            original={row.clockInLocal}
            corrected={row.correctedClockInLocal}
          />
        ),
      },
      {
        title: t('pages.hr.attendance.review.clockOutLocal'),
        key: 'clockOut',
        width: 110,
        render: (_: unknown, row: AttendanceDailyLog) => (
          <ClockCell
            original={row.clockOutLocal}
            corrected={row.correctedClockOutLocal}
          />
        ),
      },
      {
        title: t('pages.hr.attendance.review.columns.flag'),
        key: 'flag',
        width: 200,
        render: (_: unknown, row: AttendanceDailyLog) => {
          const flags = resolveDayFlags(row);
          if (flags.length === 0) {
            return <span className="text-slate-400">-</span>;
          }
          const explanation = row.fieldMovementEntries?.find(
            (entry) =>
              entry.log?.status === 'SUBMITTED' ||
              entry.log?.status === 'IN_REVIEW' ||
              entry.log?.status === 'APPROVED',
          );
          const tooltip = explanation
            ? t('pages.hr.attendance.dailyDrawer.explained', {
                reason: explanation.reason,
              })
            : t('pages.hr.attendance.dailyDrawer.noExplanation');
          return (
            <div className="flex flex-wrap gap-1">
              {flags.map(({ flag, resolved }) => (
                <FlagPill
                  key={flag}
                  flag={flag}
                  resolved={resolved}
                  tooltip={tooltip}
                />
              ))}
            </div>
          );
        },
      },
      {
        title: t('pages.hr.attendance.daily.deduction'),
        key: 'deduction',
        width: 108,
        align: 'right',
        render: (_: unknown, row: AttendanceDailyLog) => {
          const deduction = row.dayDeduction ?? 0;
          return (
            <span
              className={`text-[13px] font-semibold tabular-nums ${
                deduction > 0 ? 'text-red-700' : 'text-slate-400'
              }`}
            >
              {deduction}
            </span>
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
      rootClassName="erp-att-daily-drawer"
      closable
      title={
        employee ? (
          <div className="flex min-w-0 items-center gap-3 py-1">
            <Avatar
              size={40}
              className="shrink-0 !rounded-xl !text-sm !font-semibold"
              style={{ background: avatarColor(employee.id) }}
            >
              {initialsOf(employee.firstName, employee.lastName)}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-base leading-snug font-semibold text-slate-900">
                {employeeName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] font-normal text-slate-600">
                <span className="rounded-md bg-slate-100 px-1.5 py-px font-mono text-xs text-slate-700">
                  {employeeCode}
                </span>
                <span>{periodLabel}</span>
              </div>
            </div>
          </div>
        ) : (
          t('pages.hr.attendance.review.dailyLogsTitle')
        )
      }
      open={open}
      onClose={onClose}
      size={DRAWER_WIDTH_SUBMITTAL}
      styles={{
        ...detailDrawerStyles,
        header: {
          ...(detailDrawerStyles as { header?: React.CSSProperties }).header,
          height: 'auto',
          minHeight: 68,
          padding: '12px 20px',
        },
        body: { padding: 20, background: '#f7f8fa' },
      }}
      destroyOnHidden
    >
      {query.isLoading && !query.data ? (
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className={`flex flex-col gap-0.5 rounded-xl bg-white px-4 py-3 ${CARD_SHADOW}`}
              >
                <dt className="text-xs font-medium text-slate-600">{stat.label}</dt>
                <dd className={`m-0 text-[22px] leading-tight font-semibold tabular-nums ${stat.tone}`}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className={`overflow-hidden rounded-2xl bg-white ${CARD_SHADOW} [&_.ant-table-thead>tr>th]:!bg-[#f7f8fa] [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-thead>tr>th]:!tracking-[0.04em] [&_.ant-table-thead>tr>th]:!text-gray-600 [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-thead>tr>th]:!leading-snug [&_.ant-table-thead>tr>th]:!whitespace-normal [&_.ant-table-thead>tr>th]:!border-b [&_.ant-table-thead>tr>th]:!border-[#eef1f4] [&_.ant-table-tbody>tr>td]:!py-2.5 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!border-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!p-0`}
          >
            <DataTable<AttendanceDailyLog>
              className="erp-data-table erp-pro-table erp-users-table"
              rowKey="id"
              columns={columns}
              dataSource={logs}
              loading={query.isFetching}
              size="small"
              scroll={{ x: 760, y: 'calc(100vh - 330px)' }}
              pagination={false}
              rowClassName={rowClassName}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
