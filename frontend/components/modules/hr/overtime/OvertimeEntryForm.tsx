'use client';

import { useMemo } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Spin,
  Tag,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import OvertimeSiteChips from '@/components/modules/hr/overtime/OvertimeSiteChips';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  OvertimeEntry,
  PreviewOvertimeEntryResult,
  SelectableOvertimeWindowsResult,
} from '@/lib/api/overtime.types';
import { formatOvertimeHours } from '@/lib/utils/overtime-display';

export interface OvertimeEntryFormValues {
  date: Dayjs;
  startTime: string;
  endTime: string;
  taskDescription: string;
}

const END_OF_DAY = '24:00';
const LUNCH_START_MINUTES = 12 * 60 + 30;
const LUNCH_END_MINUTES = 13 * 60 + 30;
const LUNCH_END_HHMM = '13:30';

/** Ant Design virtual list mis-scrolls on ~90+ time options; lists are small enough to render flat. */
const TIME_SELECT_PROPS = {
  virtual: false,
  listHeight: 280,
} as const;

function parseHhMmToMinutes(value: string): number {
  if (value === END_OF_DAY) {
    return 24 * 60;
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhMm(minutes: number): string {
  if (minutes >= 24 * 60) {
    return END_OF_DAY;
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function isInsideWeekdayLunch(minutes: number): boolean {
  return minutes >= LUNCH_START_MINUTES && minutes < LUNCH_END_MINUTES;
}

/**
 * Weekday lunch exclusion for OT pickers. Skip Sat/Sun, holidays, and site days.
 */
export function shouldExcludeWeekdayLunch(
  date: Dayjs | null | undefined,
  windows: SelectableOvertimeWindowsResult | null,
): boolean {
  if (!date || !windows) {
    return false;
  }
  if (windows.siteAssignmentDay) {
    return false;
  }
  if (windows.dayKind === 'HOLIDAY') {
    return false;
  }
  const day = date.day();
  return day >= 1 && day <= 5;
}

/** Snap a start time that falls in 12:30–13:30 forward to 13:30. */
export function snapStartPastWeekdayLunch(startTime: string): string {
  const minutes = parseHhMmToMinutes(startTime);
  if (isInsideWeekdayLunch(minutes)) {
    return LUNCH_END_HHMM;
  }
  return startTime;
}

/**
 * End times inside the selectable window that contains `startTime`.
 * On weekdays, also caps at lunch (12:30) when start is before lunch so the
 * interval cannot span the break (site/holiday/weekend skip that cap).
 */
export function enumerateEndTimesInWindows(
  startTime: string,
  windows: Array<{ start: string; end: string }>,
  options?: { excludeWeekdayLunch?: boolean },
): string[] {
  const start = parseHhMmToMinutes(startTime);
  const containing = windows.find((window) => {
    const ws = parseHhMmToMinutes(window.start);
    const we = parseHhMmToMinutes(window.end);
    return start >= ws && start < we;
  });
  if (!containing) {
    return [];
  }

  let maxEnd = parseHhMmToMinutes(containing.end);
  if (options?.excludeWeekdayLunch && start < LUNCH_START_MINUTES) {
    maxEnd = Math.min(maxEnd, LUNCH_START_MINUTES);
  }

  const times: string[] = [];
  for (let m = start + 15; m <= maxEnd; m += 15) {
    times.push(minutesToHhMm(m));
  }
  return times;
}

/** Start times inside windows (exclusive of window end), 15-min steps. */
export function enumerateStartTimes(
  windows: Array<{ start: string; end: string }>,
  options?: { excludeWeekdayLunch?: boolean },
): string[] {
  const times = new Set<string>();
  for (const window of windows) {
    const ws = parseHhMmToMinutes(window.start);
    const we = parseHhMmToMinutes(window.end);
    for (let m = ws; m < we; m += 15) {
      if (options?.excludeWeekdayLunch && isInsideWeekdayLunch(m)) {
        continue;
      }
      times.add(minutesToHhMm(m));
    }
  }
  return [...times].sort((a, b) => parseHhMmToMinutes(a) - parseHhMmToMinutes(b));
}

interface OvertimeEntryFormProps {
  form: FormInstance<OvertimeEntryFormValues>;
  formId?: string;
  disabledDate: (current: Dayjs | null) => boolean;
  preview: PreviewOvertimeEntryResult | null;
  previewLoading: boolean;
  periodLabel: string;
  windows: SelectableOvertimeWindowsResult | null;
  windowsLoading: boolean;
  employeeId?: string;
  /** Other entries on the sheet — shown when the selected date already has OT. */
  sheetEntries?: OvertimeEntry[];
  excludeEntryId?: string;
  onFinish?: (values: OvertimeEntryFormValues) => void | Promise<void>;
  onAddNextDay?: (nextDate: Dayjs) => void;
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#e8ebef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#e8ebef] bg-[#fafbfc] px-4 py-2.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
          {title}
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function HoursPreviewChip({
  label,
  value,
  emphasize,
  hint,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  hint?: string | null;
}): React.ReactNode {
  return (
    <div
      className={`min-w-0 rounded-lg border px-3 py-2.5 ${
        emphasize
          ? 'border-[#1D9E75]/30] bg-[#E1F5EE]'
          : 'border-[#e8ebef] bg-[#fafbfc]'
      }`}
    >
      <p className="m-0 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p
        className={`m-0 mt-0.5 text-[15px] font-semibold tabular-nums leading-tight ${
          emphasize ? 'text-[#0F6E56]' : 'text-[var(--color-text-primary)]'
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="m-0 mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Overtime sheet entry fields: same-day only, windows from the server, live hours preview.
 */
export default function OvertimeEntryForm({
  form,
  formId = 'overtime-entry-form',
  disabledDate,
  preview,
  previewLoading,
  periodLabel,
  windows,
  windowsLoading,
  employeeId,
  sheetEntries,
  excludeEntryId,
  onFinish,
  onAddNextDay,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const watchedDate = Form.useWatch('date', form);
  const watchedStart = Form.useWatch('startTime', form);
  const watchedEnd = Form.useWatch('endTime', form);
  const dateKey = watchedDate?.format('YYYY-MM-DD') ?? null;

  const overtimeExtraLines = useMemo(() => {
    if (!dateKey || !sheetEntries?.length) {
      return [];
    }
    return sheetEntries
      .filter(
        (entry) =>
          entry.date === dateKey &&
          entry.id !== excludeEntryId,
      )
      .map((entry) =>
        t('hr.dayCoverage.overtimeEntry', {
          date: entry.date,
          start: entry.startTime,
          end: entry.endTime,
        }),
      );
  }, [dateKey, excludeEntryId, sheetEntries, t]);

  const excludeWeekdayLunch = shouldExcludeWeekdayLunch(watchedDate, windows);

  const startOptions = useMemo(() => {
    if (!windows?.windows?.length) {
      return [];
    }
    return enumerateStartTimes(windows.windows, {
      excludeWeekdayLunch,
    }).map((value) => ({
      value,
      label: value,
    }));
  }, [windows, excludeWeekdayLunch]);

  const endOptions = useMemo(() => {
    if (!watchedStart || !windows?.windows?.length) {
      return [];
    }
    const effectiveStart = excludeWeekdayLunch
      ? snapStartPastWeekdayLunch(watchedStart)
      : watchedStart;
    return enumerateEndTimesInWindows(effectiveStart, windows.windows, {
      excludeWeekdayLunch,
    }).map((value) => ({
      value,
      label: value,
      title:
        excludeWeekdayLunch &&
        parseHhMmToMinutes(effectiveStart) < LUNCH_START_MINUTES &&
        parseHhMmToMinutes(value) === LUNCH_START_MINUTES
          ? t('hr.labels.lunchBreakOtCapTooltip')
          : undefined,
    }));
  }, [watchedStart, windows, excludeWeekdayLunch, t]);

  const blockedLeave = windows?.blockedReason === 'FULL_DAY_LEAVE';
  const timesDisabled =
    blockedLeave || windowsLoading || !windows?.windows?.length;

  return (
    <Form<OvertimeEntryFormValues>
      id={formId}
      form={form}
      layout="vertical"
      requiredMark={false}
      className="erp-drawer-form"
      onFinish={(values) => void onFinish?.(values)}
    >
      <div className="flex flex-col gap-4">
        <DrawerSection title={t('hr.section.entryDetails')}>
          <div className="erp-form-grid-2">
            <Form.Item
              name="date"
              label={t('hr.table.date')}
              className="md:col-span-2"
              extra={t('hr.labels.overtimeEntryDateHint', {
                period: periodLabel,
              })}
              rules={[
                { required: true, message: t('hr.validation.selectDate') },
              ]}
            >
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                disabledDate={disabledDate}
              />
            </Form.Item>

            <DayCoverageNotice
              className="md:col-span-2"
              employeeId={employeeId}
              from={dateKey}
              to={dateKey}
              extraLines={overtimeExtraLines}
            />

            {windowsLoading ? (
              <div className="md:col-span-2 flex items-center gap-2 py-1">
                <Spin size="small" />
                <span className="text-[13px] text-[var(--color-text-secondary)]">
                  {t('hr.labels.selectableWindowsLoading')}
                </span>
              </div>
            ) : null}

            {blockedLeave ? (
              <Alert
                type="info"
                showIcon
                className="md:col-span-2"
                title={
                  windows?.message ?? t('hr.labels.approvedLeaveNoOvertime')
                }
              />
            ) : null}

            {!windowsLoading && windows?.siteAssignmentDay ? (
              <Alert
                type="info"
                showIcon
                className="md:col-span-2"
                title={t('hr.labels.siteAssignmentFullDayOt')}
                description={
                  windows.siteName
                    ? t('pages.hr.overtime.siteAssignmentAt', {
                        site: windows.siteName,
                      })
                    : undefined
                }
              />
            ) : null}

            {!windowsLoading &&
            windows &&
            !blockedLeave &&
            windows.windows.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                className="md:col-span-2"
                title={
                  windows.message ?? t('hr.labels.noSelectableWindows')
                }
              />
            ) : null}

            <Form.Item
              name="startTime"
              label={t('hr.form.startTime')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.startTimeRequired'),
                },
              ]}
            >
              <Select
                {...TIME_SELECT_PROPS}
                className="w-full"
                showSearch
                optionFilterProp="label"
                options={startOptions}
                disabled={timesDisabled}
                placeholder={t('hr.placeholder.selectStartTime')}
                onChange={(value: string) => {
                  const nextStart = excludeWeekdayLunch
                    ? snapStartPastWeekdayLunch(value)
                    : value;
                  form.setFieldsValue({
                    startTime: nextStart,
                    endTime: undefined,
                  });
                }}
              />
            </Form.Item>

            <Form.Item
              name="endTime"
              label={t('hr.form.endTime')}
              dependencies={['startTime']}
              extra={
                excludeWeekdayLunch &&
                watchedStart &&
                parseHhMmToMinutes(snapStartPastWeekdayLunch(watchedStart)) <
                  LUNCH_START_MINUTES
                  ? t('hr.labels.lunchBreakOtCapTooltip')
                  : undefined
              }
              rules={[
                {
                  required: true,
                  message: t('hr.validation.endTimeRequired'),
                },
                ({ getFieldValue }) => ({
                  validator: (_rule, value: string | undefined) => {
                    const start = getFieldValue('startTime') as
                      | string
                      | undefined;
                    if (!start || !value) {
                      return Promise.resolve();
                    }
                    const effectiveStart = excludeWeekdayLunch
                      ? snapStartPastWeekdayLunch(start)
                      : start;
                    if (
                      parseHhMmToMinutes(value) <=
                      parseHhMmToMinutes(effectiveStart)
                    ) {
                      return Promise.reject(
                        new Error(t('hr.dateRules.endAfterStart')),
                      );
                    }
                    const allowed = windows?.windows?.length
                      ? enumerateEndTimesInWindows(
                          effectiveStart,
                          windows.windows,
                          { excludeWeekdayLunch },
                        )
                      : [];
                    if (allowed.length > 0 && !allowed.includes(value)) {
                      return Promise.reject(
                        new Error(t('hr.labels.noSelectableWindows')),
                      );
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <Select
                {...TIME_SELECT_PROPS}
                key={watchedStart ?? 'end-time'}
                className="w-full"
                showSearch
                optionFilterProp="label"
                options={endOptions}
                disabled={timesDisabled || !watchedStart}
                placeholder={t('hr.placeholder.selectEndTime')}
              />
            </Form.Item>

            {/* {excludeWeekdayLunch ? (
              <p className="md:col-span-2 m-0 text-[12px] text-[var(--color-text-tertiary)]">
                {t('hr.labels.lunchBreakOtExcluded')}
              </p>
            ) : null} */}
          </div>

          {watchedEnd === END_OF_DAY && watchedDate ? (
            <Alert
              type="info"
              showIcon
              className="!mt-3"
              title={t('hr.labels.workedPastMidnight', {
                date: watchedDate.add(1, 'day').format('DD/MM/YYYY'),
              })}
              // action={
              //   onAddNextDay ? (
              //     <Button
              //       size="small"
              //       type="link"
              //       onClick={() => onAddNextDay(watchedDate.add(1, 'day'))}
              //     >
              //       {t('hr.buttons.addNextDayEntry')}
              //     </Button>
              //   ) : null
              // }
            />
          ) : null}

          {watchedStart && watchedEnd ? (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-secondary, #fafafa)',
                borderRadius: 8,
                border: '1px solid var(--color-border, #e8ebef)',
                marginTop: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t('pages.hr.overtime.classificationPreview')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {preview && Number(preview.regularHours) > 0 ? (
                  <Tag color="blue">{t('pages.hr.overtime.rateRegular')}</Tag>
                ) : null}
                {preview && Number(preview.nightHours) > 0 ? (
                  <Tag color="purple">{t('pages.hr.overtime.rateNight')}</Tag>
                ) : null}
                {preview && Number(preview.weekendHours) > 0 ? (
                  <Tag color="orange">{t('pages.hr.overtime.rateWeekend')}</Tag>
                ) : null}
                {preview && Number(preview.holidayHours) > 0 ? (
                  <Tag color="red">{t('pages.hr.overtime.rateHoliday')}</Tag>
                ) : null}
                {!preview && !previewLoading ? (
                  <>
                    <Tag color="blue">{t('pages.hr.overtime.rateRegular')}</Tag>
                    <Tag color="purple">{t('pages.hr.overtime.rateNight')}</Tag>
                  </>
                ) : null}
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {t('pages.hr.overtime.classificationPreviewHint')}
              </p>
            </div>
          ) : null}
        </DrawerSection>

        <DrawerSection title={t('hr.section.hoursPreview')}>
          {previewLoading && !preview ? (
            <div className="flex items-center gap-2 py-2">
              <Spin size="small" />
              <span className="text-[13px] text-[var(--color-text-secondary)]">
                {t('hr.labels.hoursPreviewLoading')}
              </span>
            </div>
          ) : preview ? (
            <div className="relative">
              {previewLoading ? (
                <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-lg bg-white/60">
                  <Spin size="small" />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.regular')}
                  value={formatOvertimeHours(preview.regularHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.night')}
                  value={formatOvertimeHours(preview.nightHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.weekend')}
                  value={formatOvertimeHours(preview.weekendHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.holiday')}
                  value={formatOvertimeHours(preview.holidayHours)}
                  hint={preview.holidayName}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.total')}
                  value={formatOvertimeHours(preview.totalHours)}
                  emphasize
                />
              </div>
              {preview.attendanceWarning ? (
                <Alert
                  type="warning"
                  showIcon
                  className="!mt-3"
                  title={preview.attendanceWarning}
                />
              ) : null}
              {preview.siteName ? (
                <p className="m-0 mt-3 text-[12px] text-[var(--color-text-secondary)]">
                  {t('hr.labels.siteAssignmentFullDayOt')}
                </p>
              ) : preview.scheduleNote ? (
                <p className="m-0 mt-3 text-[12px] text-[var(--color-text-secondary)]">
                  {preview.scheduleNote}
                </p>
              ) : null}
              {preview.siteName ? (
                <OvertimeSiteChips
                  entry={{
                    siteAssignmentId: preview.siteName,
                    siteName: preview.siteName,
                    siteWithinScheduleHours: preview.siteWithinScheduleHours,
                    siteReviewFlag: null,
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="m-0 text-[13px] text-[var(--color-text-secondary)]">
              {t('hr.labels.hoursPreviewEmpty')}
            </p>
          )}
        </DrawerSection>

        <DrawerSection title={t('hr.labels.taskDescription')}>
          <Form.Item
            name="taskDescription"
            className="!mb-0"
            rules={[
              {
                required: true,
                message: t('hr.validation.taskDescriptionRequired'),
              },
              { max: 4000 },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={4000}
              showCount
              placeholder={t('hr.placeholder.overtimeTaskDescription')}
            />
          </Form.Item>
        </DrawerSection>
      </div>
    </Form>
  );
}
