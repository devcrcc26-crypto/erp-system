'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Input, InputNumber, Skeleton, Tag, Tooltip } from 'antd';
import { FileSearchOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PayrollOtAdjustment,
  PayrollOtBreakdown,
  PayrollOtCategory,
} from '@/lib/api/payroll.types';
import {
  usePayrollOtBreakdown,
  useReplacePayrollOtAdjustments,
} from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatPayrollMoney } from '@/lib/utils/payroll-display';
import { previewOtBreakdown } from '@/lib/utils/payroll-live';
import { formatUserName } from '@/lib/utils/user-display';
import { useReportDirty } from '@/components/modules/hr/payroll/payroll-entry-dirty';

const KEY = 'hr.payroll.otAdjust';

const CATEGORIES: readonly PayrollOtCategory[] = ['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'];

/** Same labels as the overtime module (Normal OT, Evening OT, Weekend, Holiday). */
const CATEGORY_LABEL_KEY: Record<PayrollOtCategory, string> = {
  NORMAL: 'hr.overtimeCategory.regular',
  EVENING: 'hr.overtimeCategory.night',
  SUNDAY: 'hr.overtimeCategory.weekend',
  HOLIDAY: 'hr.overtimeCategory.holiday',
};

type HoursByCategory = Record<PayrollOtCategory, number | null>;

function hoursFromAdjustments(adjustments: readonly PayrollOtAdjustment[]): HoursByCategory {
  const hours: HoursByCategory = { NORMAL: null, EVENING: null, SUNDAY: null, HOLIDAY: null };
  for (const row of adjustments) {
    hours[row.otCategory] = row.hours;
  }
  return hours;
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hoursLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Overtime tab: one spreadsheet-style grid. System hours (approved overtime
 * sheets) are fixed; manual hours (paper records) are typed straight into the
 * grid and the totals and pay recalculate as you type. Enter saves, Esc reverts.
 */
export default function PayrollOtAdjustmentsSection({
  runId,
  employeeId,
  canEdit,
}: {
  runId: string;
  employeeId: string;
  /** Payroll edit permission (the run status is checked here too). */
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = usePayrollOtBreakdown(runId, employeeId);
  const data = query.data;

  if (query.isLoading) {
    return <Skeleton active paragraph={{ rows: 5 }} title={false} />;
  }
  if (query.isError || !data) {
    return <Alert type="error" showIcon title={t(`${KEY}.loadFailed`)} />;
  }

  const editable = canEdit && data.editable && data.paidDays > 0;
  return (
    <OtGrid
      // A new saved set re-seeds the cells (same numbers after a save).
      key={data.adjustments.map((row) => `${row.id}:${row.updatedAt}`).join('|')}
      runId={runId}
      employeeId={employeeId}
      data={data}
      editable={editable}
    />
  );
}

function OtGrid({
  runId,
  employeeId,
  data,
  editable,
}: {
  runId: string;
  employeeId: string;
  data: PayrollOtBreakdown;
  editable: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const replace = useReplacePayrollOtAdjustments(runId);

  const saved = useMemo(() => hoursFromAdjustments(data.adjustments), [data.adjustments]);
  const savedNote = data.adjustments[0]?.note ?? '';
  const [hours, setHours] = useState<HoursByCategory>(saved);
  const [note, setNote] = useState(savedNote);

  const changed =
    CATEGORIES.some((category) => num(hours[category]) !== num(saved[category])) ||
    note.trim() !== savedNote.trim();
  const anyHours = CATEGORIES.some((category) => num(hours[category]) !== 0);
  const noteMissing = anyHours && !note.trim();
  useReportDirty('ot-adjustment', changed);

  // Live figures while typing (server figures replace them after a save).
  const preview = useMemo(
    () =>
      previewOtBreakdown(
        data,
        Object.fromEntries(CATEGORIES.map((category) => [category, num(hours[category])])),
      ),
    [data, hours],
  );

  function revert(): void {
    setHours(saved);
    setNote(savedNote);
  }

  function save(): void {
    if (!changed || noteMissing) {
      if (noteMissing) messageApi.error(t(`${KEY}.noteRequired`));
      return;
    }
    const items = CATEGORIES.filter((category) => num(hours[category]) !== 0).map(
      (category) => ({ otCategory: category, hours: num(hours[category]) }),
    );
    replace.mutate(
      { employeeId, items, note: items.length > 0 ? note.trim() : undefined },
      {
        onError: (error: unknown) => notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t),
      },
    );
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape' && changed) {
      event.stopPropagation();
      revert();
    }
  }

  const latest = data.adjustments.reduce<PayrollOtAdjustment | null>(
    (current, row) =>
      !current || dayjs(row.updatedAt).isAfter(dayjs(current.updatedAt)) ? row : current,
    null,
  );
  const lockedReason = !data.editable
    ? t(`${KEY}.locked`, { status: data.runStatus })
    : data.paidDays === 0
      ? t(`${KEY}.zeroDays`)
      : null;
  const systemHoursTotal = data.categories.reduce((sum, row) => sum + row.systemHours, 0);
  const manualHoursTotal = preview.categories.reduce((sum, row) => sum + row.manualHours, 0);
  const totalHours = preview.categories.reduce((sum, row) => sum + row.totalHours, 0);

  return (
    <div className="erp-otg" onKeyDown={editable ? onKeyDown : undefined}>
      <div className="erp-otg-head">
        <p className="erp-otg-hint">
          {editable ? t(`${KEY}.gridLiveHint`) : lockedReason ?? t(`${KEY}.readOnlyHint`)}
        </p>
        {data.overtimeSheetId ? (
          <Link href={`/hr/overtime/${data.overtimeSheetId}`} className="erp-otg-link">
            <FileSearchOutlined aria-hidden />
            {t(`${KEY}.viewDates`)}
          </Link>
        ) : null}
      </div>

      <div className="erp-otg-scroll">
        <table className="erp-otg-table">
          <thead>
            <tr>
              <th scope="col">{t(`${KEY}.colCategory`)}</th>
              <th scope="col" className="is-num">{t(`${KEY}.colSystem`)}</th>
              <th scope="col" className="is-num is-manual">
                {t(`${KEY}.colManual`)}
                <Tag className="erp-payroll-otadj-tag erp-otg-tag">{t(`${KEY}.manualTag`)}</Tag>
              </th>
              <th scope="col" className="is-num">{t(`${KEY}.colTotal`)}</th>
              <th scope="col" className="is-num">{t(`${KEY}.colPay`)}</th>
            </tr>
          </thead>
          <tbody>
            {preview.categories.map((row) => {
              const typed = num(hours[row.category]);
              const capped = typed !== 0 && row.manualHours !== typed;
              const label = t(CATEGORY_LABEL_KEY[row.category]);
              return (
                <tr key={row.category}>
                  <th scope="row">{label}</th>
                  <td className="is-num is-muted">{hoursLabel(row.systemHours)}</td>
                  <td className="is-num is-manual">
                    {editable ? (
                      <InputNumber
                        size="small"
                        controls={false}
                        step={0.5}
                        min={-744}
                        max={744}
                        precision={2}
                        value={hours[row.category]}
                        placeholder="0"
                        aria-label={t(`${KEY}.manualHoursFor`, { category: label })}
                        className={`erp-otg-input${typed < 0 ? ' is-negative' : ''}`}
                        onChange={(value) =>
                          setHours((prev) => ({
                            ...prev,
                            [row.category]: typeof value === 'number' ? value : null,
                          }))
                        }
                      />
                    ) : typed !== 0 ? (
                      <span className={typed < 0 ? 'erp-otg-neg' : 'erp-otg-pos'}>
                        {typed > 0 ? '+' : ''}
                        {hoursLabel(typed)}
                      </span>
                    ) : (
                      <span className="is-muted">—</span>
                    )}
                  </td>
                  <td className="is-num">
                    {hoursLabel(row.totalHours)}
                    {capped ? (
                      <Tooltip
                        title={t(`${KEY}.cappedHint`, { applied: hoursLabel(row.manualHours) })}
                      >
                        <InfoCircleOutlined className="erp-otg-cap" aria-hidden />
                      </Tooltip>
                    ) : null}
                  </td>
                  <td className="is-num is-strong">
                    {formatPayrollMoney(row.totalPay, { emptyZero: false })}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('hr.payroll.entry.otTotal')}</th>
              <td className="is-num">{hoursLabel(systemHoursTotal)}</td>
              <td className="is-num is-manual">{hoursLabel(manualHoursTotal)}</td>
              <td className="is-num">{hoursLabel(totalHours)}</td>
              <td className="is-num is-strong">
                {formatPayrollMoney(preview.totals.totalPay, { emptyZero: false })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable ? (
        <label className="erp-otg-note">
          <span>{t(`${KEY}.colNote`)}</span>
          <Input
            value={note}
            maxLength={500}
            placeholder={t(`${KEY}.notePlaceholder`)}
            status={noteMissing ? 'error' : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          {noteMissing ? <small className="is-error">{t(`${KEY}.noteRequired`)}</small> : null}
        </label>
      ) : savedNote ? (
        <p className="erp-otg-saved-note">{savedNote}</p>
      ) : null}

      <div className="erp-otg-foot">
        <p className="erp-otg-meta">
          {replace.isPending
            ? t(`${KEY}.saving`)
            : latest
              ? t(`${KEY}.updatedBy`, {
                  name: formatUserName(latest.updatedBy),
                  date: dayjs(latest.updatedAt).format('YYYY-MM-DD HH:mm'),
                })
              : null}
        </p>
        {editable && changed ? (
          <div className="erp-otg-actions">
            <Button size="small" onClick={revert}>
              {t(`${KEY}.revert`)}
            </Button>
            <Button size="small" type="primary" disabled={noteMissing} onClick={save}>
              {t(`${KEY}.saveEnter`)}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
