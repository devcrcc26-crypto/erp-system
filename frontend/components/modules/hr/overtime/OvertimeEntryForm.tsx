'use client';

import { useMemo } from 'react';
import { Alert, DatePicker, Form, Spin, Tag } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import OvertimeSiteChips from '@/components/modules/hr/overtime/OvertimeSiteChips';
import OvertimeTimePeriodsEditor from '@/components/modules/hr/overtime/OvertimeTimePeriodsEditor';
import {
  preferredOvertimeStart,
  shouldExcludeWeekdayLunchFromWindows,
  type OvertimeTimePeriodRow,
} from '@/components/modules/hr/overtime/overtime-time-periods';
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
  periods: OvertimeTimePeriodRow[];
}

export {
  preferredOvertimeStart,
  enumerateEndTimesInWindows,
  enumerateStartTimes,
  snapStartPastWeekdayLunch,
  shouldExcludeWeekdayLunchFromWindows as shouldExcludeWeekdayLunch,
  overtimePeriodsOverlap,
  completeOvertimePeriods,
  calculateOTHours,
} from '@/components/modules/hr/overtime/overtime-time-periods';

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
  /** Entry ids currently being edited (excluded from day-coverage extras). */
  excludeEntryIds?: string[];
  allowMultiplePeriods?: boolean;
  onFinish?: (values: OvertimeEntryFormValues) => void | Promise<void>;
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
 * Overtime sheet entry fields: same-day periods (leave-style), windows from the
 * server, live hours preview.
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
  excludeEntryIds,
  allowMultiplePeriods = true,
  onFinish,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const watchedDate = Form.useWatch('date', form);
  const watchedPeriods =
    (Form.useWatch('periods', form) as OvertimeTimePeriodRow[] | undefined) ??
    [];
  const dateKey = watchedDate?.format('YYYY-MM-DD') ?? null;
  const excludeIdSet = useMemo(
    () => new Set(excludeEntryIds ?? []),
    [excludeEntryIds],
  );

  const overtimeExtraLines = useMemo(() => {
    if (!dateKey || !sheetEntries?.length) {
      return [];
    }
    return sheetEntries
      .filter(
        (entry) => entry.date === dateKey && !excludeIdSet.has(entry.id),
      )
      .map((entry) =>
        t('hr.dayCoverage.overtimeEntry', {
          date: entry.date,
          start: entry.startTime,
          end: entry.endTime,
        }),
      );
  }, [dateKey, excludeIdSet, sheetEntries, t]);

  const excludeWeekdayLunch = shouldExcludeWeekdayLunchFromWindows(
    watchedDate,
    windows,
  );
  const blockedLeave = windows?.blockedReason === 'FULL_DAY_LEAVE';
  const timesDisabled =
    !dateKey ||
    blockedLeave ||
    windowsLoading ||
    !windows?.windows?.length;

  const hasCompletePeriod = watchedPeriods.some(
    (row) => row.startTime && row.endTime,
  );

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
                title={windows.message ?? t('hr.labels.noSelectableWindows')}
              />
            ) : null}

            <OvertimeTimePeriodsEditor
              form={form}
              windows={windows}
              windowsLoading={windowsLoading}
              timesDisabled={timesDisabled}
              excludeWeekdayLunch={excludeWeekdayLunch}
              allowMultiple={allowMultiplePeriods}
            />

            {hasCompletePeriod ? (
              <div
                className="md:col-span-2"
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg-secondary, #fafafa)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e8ebef)',
                  marginTop: 4,
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
                    <Tag color="orange">
                      {t('pages.hr.overtime.rateWeekend')}
                    </Tag>
                  ) : null}
                  {preview && Number(preview.holidayHours) > 0 ? (
                    <Tag color="red">{t('pages.hr.overtime.rateHoliday')}</Tag>
                  ) : null}
                  {!preview && !previewLoading ? (
                    <>
                      <Tag color="blue">
                        {t('pages.hr.overtime.rateRegular')}
                      </Tag>
                      <Tag color="purple">
                        {t('pages.hr.overtime.rateNight')}
                      </Tag>
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
          </div>
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
      </div>
    </Form>
  );
}
