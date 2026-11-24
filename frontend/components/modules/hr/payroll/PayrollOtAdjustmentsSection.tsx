'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Input, InputNumber, Popconfirm, Spin, Tag } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PayrollOtAdjustment,
  PayrollOtBreakdown,
  PayrollOtCategory,
} from '@/lib/api/payroll.types';
import {
  useDeletePayrollOtAdjustment,
  usePayrollOtBreakdown,
  useUpsertPayrollOtAdjustment,
} from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatPayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useReportDirty } from '@/components/modules/hr/payroll/payroll-entry-dirty';

const KEY = 'hr.payroll.otAdjust';

const CATEGORIES: readonly PayrollOtCategory[] = [
  'NORMAL',
  'EVENING',
  'SUNDAY',
  'HOLIDAY',
];

/** Same labels as the overtime module (Normal OT, Evening OT, Weekend, Holiday). */
const CATEGORY_LABEL_KEY: Record<PayrollOtCategory, string> = {
  NORMAL: 'hr.overtimeCategory.regular',
  EVENING: 'hr.overtimeCategory.night',
  SUNDAY: 'hr.overtimeCategory.weekend',
  HOLIDAY: 'hr.overtimeCategory.holiday',
};

type HoursByCategory = Record<PayrollOtCategory, number | null>;

function emptyHours(): HoursByCategory {
  return { NORMAL: null, EVENING: null, SUNDAY: null, HOLIDAY: null };
}

function hoursFromAdjustments(
  adjustments: readonly PayrollOtAdjustment[],
): HoursByCategory {
  const hours = emptyHours();
  for (const row of adjustments) {
    hours[row.otCategory] = row.hours;
  }
  return hours;
}

function hoursLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function signedHours(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${hoursLabel(Math.abs(value))}`;
}

function coerceHours(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Overtime tab of a payroll entry: system OT (approved overtime sheets) and
 * manual adjustments for paper-based records. Manual hours are edited as an
 * Excel-style row (one cell per OT category); empty cells count as 0.
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
    return (
      <div className="erp-payroll-otadj erp-payroll-otadj--loading">
        <Spin size="small" />
      </div>
    );
  }
  if (query.isError || !data) {
    return <Alert type="error" showIcon title={t(`${KEY}.loadFailed`)} />;
  }

  return (
    <div className="erp-payroll-otadj">
      <div className="erp-payroll-otadj-col">
        <SystemOtTable data={data} />
        <OtSummary data={data} />
      </div>
      <ManualOtEditor
        employeeId={employeeId}
        runId={runId}
        data={data}
        canEdit={canEdit && data.editable && data.paidDays > 0}
      />
    </div>
  );
}

function SystemOtTable({ data }: { data: PayrollOtBreakdown }): React.ReactNode {
  const { t } = useEpcTranslation();
  const rows = data.categories.filter((row) => row.systemHours !== 0);
  return (
    <section className="erp-payroll-otadj-block">
      <header className="erp-payroll-otadj-head">
        <div className="min-w-0">
          <h4 className="erp-payroll-otadj-title">{t(`${KEY}.systemTitle`)}</h4>
          <p className="erp-payroll-otadj-sub">{t(`${KEY}.systemSub`)}</p>
        </div>
        {data.overtimeSheetId && rows.length > 0 ? (
          <Link
            href={`/hr/overtime/${data.overtimeSheetId}`}
            className="erp-payroll-otadj-link"
          >
            <FileSearchOutlined aria-hidden />
            {t(`${KEY}.viewDates`)}
          </Link>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="erp-payroll-otadj-empty">{t(`${KEY}.systemEmpty`)}</p>
      ) : (
        <table className="erp-payroll-otadj-table">
          <thead>
            <tr>
              <th scope="col">{t(`${KEY}.colCategory`)}</th>
              <th scope="col" className="is-num">
                {t(`${KEY}.colHours`)}
              </th>
              <th scope="col" className="is-num">
                {t(`${KEY}.colPay`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category}>
                <td>{t(CATEGORY_LABEL_KEY[row.category])}</td>
                <td className="is-num">{hoursLabel(row.systemHours)}</td>
                <td className="is-num">
                  {formatPayrollMoney(row.systemPay, { emptyZero: false })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('hr.payroll.entry.otTotal')}</th>
              <td className="is-num">
                {hoursLabel(rows.reduce((sum, row) => sum + row.systemHours, 0))}
              </td>
              <td className="is-num">
                {formatPayrollMoney(data.totals.systemPay, { emptyZero: false })}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

interface GridFormState {
  hours: HoursByCategory;
  note: string;
}

function ManualOtEditor({
  runId,
  employeeId,
  data,
  canEdit,
}: {
  runId: string;
  employeeId: string;
  data: PayrollOtBreakdown;
  canEdit: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const upsert = useUpsertPayrollOtAdjustment(runId);
  const remove = useDeletePayrollOtAdjustment(runId);
  const [form, setForm] = useState<GridFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const baselineHours = useMemo(
    () => hoursFromAdjustments(data.adjustments),
    [data.adjustments],
  );
  const sharedNote = data.adjustments[0]?.note ?? '';

  const dirty = useMemo(() => {
    if (!form) return false;
    if (form.note.trim() !== (sharedNote ?? '').trim()) return true;
    return CATEGORIES.some(
      (category) =>
        coerceHours(form.hours[category]) !== coerceHours(baselineHours[category]),
    );
  }, [form, baselineHours, sharedNote]);

  useReportDirty('ot-adjustment', dirty);

  const hasManual = data.adjustments.length > 0;
  const nonZeroDraftCount = form
    ? CATEGORIES.filter((category) => coerceHours(form.hours[category]) !== 0)
        .length
    : 0;

  function startEdit(): void {
    setForm({
      hours: hoursFromAdjustments(data.adjustments),
      note: sharedNote,
    });
  }

  function startAdd(): void {
    setForm({ hours: emptyHours(), note: '' });
  }

  async function save(): Promise<void> {
    if (!form) return;

    const toUpsert = CATEGORIES.filter(
      (category) => coerceHours(form.hours[category]) !== 0,
    );
    const toDelete = data.adjustments.filter(
      (row) => coerceHours(form.hours[row.otCategory]) === 0,
    );

    if (toUpsert.length === 0 && toDelete.length === 0) {
      messageApi.error(t(`${KEY}.hoursRequired`));
      return;
    }

    const note = form.note.trim();
    if (toUpsert.length > 0 && !note) {
      messageApi.error(t(`${KEY}.noteRequired`));
      return;
    }

    setSaving(true);
    try {
      // Sequential so each reprice sees the previous categories.
      for (const row of toDelete) {
        await remove.mutateAsync(row.id);
      }
      for (const category of toUpsert) {
        await upsert.mutateAsync({
          employeeId,
          otCategory: category,
          hours: coerceHours(form.hours[category]),
          note,
        });
      }
      messageApi.success(t(`${KEY}.saved`));
      setForm(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    } finally {
      setSaving(false);
    }
  }

  async function clearAll(): Promise<void> {
    if (data.adjustments.length === 0) return;
    setClearing(true);
    try {
      for (const row of data.adjustments) {
        await remove.mutateAsync(row.id);
      }
      messageApi.success(t(`${KEY}.deleted`));
      setForm(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.deleteFailed`), messageApi, t);
    } finally {
      setClearing(false);
    }
  }

  const lockedReason = !data.editable
    ? t(`${KEY}.locked`, { status: data.runStatus })
    : data.paidDays === 0
      ? t(`${KEY}.zeroDays`)
      : null;

  const latestMeta = data.adjustments.reduce<PayrollOtAdjustment | null>(
    (latest, row) => {
      if (!latest) return row;
      return dayjs(row.updatedAt).isAfter(dayjs(latest.updatedAt)) ? row : latest;
    },
    null,
  );

  return (
    <section className="erp-payroll-otadj-block erp-payroll-otadj-block--manual">
      <header className="erp-payroll-otadj-head">
        <div className="min-w-0">
          <h4 className="erp-payroll-otadj-title">
            {t(`${KEY}.manualTitle`)}
            <Tag className="erp-payroll-otadj-tag">{t(`${KEY}.manualTag`)}</Tag>
          </h4>
          <p className="erp-payroll-otadj-sub">{t(`${KEY}.manualSub`)}</p>
        </div>
        {canEdit && !form ? (
          <div className="erp-payroll-otadj-head-actions">
            {hasManual ? (
              <>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={startEdit}
                >
                  {t(`${KEY}.edit`)}
                </Button>
                <Popconfirm
                  title={t(`${KEY}.clearConfirm`)}
                  okText={t('common.delete')}
                  cancelText={t('common.cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void clearAll()}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={clearing}
                  >
                    {t(`${KEY}.clearAll`)}
                  </Button>
                </Popconfirm>
              </>
            ) : (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={startAdd}
              >
                {t(`${KEY}.addAdjustment`)}
              </Button>
            )}
          </div>
        ) : null}
      </header>

      {lockedReason ? <p className="erp-payroll-otadj-empty">{lockedReason}</p> : null}

      {form ? (
        <ManualOtGridForm
          form={form}
          saving={saving}
          canSave={
            nonZeroDraftCount > 0 ||
            toDeleteCount(data.adjustments, form) > 0
          }
          requiresNote={nonZeroDraftCount > 0}
          onChange={setForm}
          onSave={() => void save()}
          onCancel={() => setForm(null)}
        />
      ) : !hasManual ? (
        <div className="erp-payroll-otadj-placeholder">
          <p>{t(`${KEY}.noManual`)}</p>
          {canEdit ? (
            <p className="erp-payroll-otadj-sub">{t(`${KEY}.noManualHint`)}</p>
          ) : null}
        </div>
      ) : (
        <ManualOtHoursTable
          hours={baselineHours}
          amounts={Object.fromEntries(
            data.adjustments.map((row) => [row.otCategory, row.amount]),
          ) as Partial<Record<PayrollOtCategory, number>>}
          applied={Object.fromEntries(
            data.adjustments.map((row) => [row.otCategory, row.appliedHours]),
          ) as Partial<Record<PayrollOtCategory, number>>}
          note={sharedNote}
          meta={
            latestMeta
              ? latestMeta.updatedAt !== latestMeta.createdAt
                ? t(`${KEY}.updatedBy`, {
                    name: formatUserName(latestMeta.updatedBy),
                    date: dayjs(latestMeta.updatedAt).format('YYYY-MM-DD HH:mm'),
                  })
                : t(`${KEY}.addedBy`, {
                    name: formatUserName(latestMeta.createdBy),
                    date: dayjs(latestMeta.createdAt).format('YYYY-MM-DD HH:mm'),
                  })
              : null
          }
        />
      )}
    </section>
  );
}

function toDeleteCount(
  adjustments: readonly PayrollOtAdjustment[],
  form: GridFormState,
): number {
  return adjustments.filter(
    (row) => coerceHours(form.hours[row.otCategory]) === 0,
  ).length;
}

function ManualOtHoursTable({
  hours,
  amounts,
  applied,
  note,
  meta,
}: {
  hours: HoursByCategory;
  amounts: Partial<Record<PayrollOtCategory, number>>;
  applied: Partial<Record<PayrollOtCategory, number>>;
  note: string;
  meta: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <div className="erp-payroll-otadj-sheet">
      <table className="erp-payroll-otadj-sheet-table">
        <thead>
          <tr>
            {CATEGORIES.map((category) => (
              <th key={category} scope="col" className="is-num">
                {t(CATEGORY_LABEL_KEY[category])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {CATEGORIES.map((category) => {
              const value = coerceHours(hours[category]);
              const appliedHours = applied[category];
              const capped =
                appliedHours != null && appliedHours !== value && value !== 0;
              return (
                <td key={category} className="is-num">
                  {value === 0 ? (
                    <span className="erp-payroll-otadj-sheet-zero">0</span>
                  ) : (
                    <span
                      className={`erp-payroll-otadj-hours${
                        value < 0 ? ' is-negative' : ''
                      }`}
                    >
                      {signedHours(value)}
                    </span>
                  )}
                  {amounts[category] != null && value !== 0 ? (
                    <p className="erp-payroll-otadj-sheet-pay">
                      {formatPayrollMoney(amounts[category]!, {
                        emptyZero: false,
                      })}{' '}
                      ETB
                    </p>
                  ) : null}
                  {capped ? (
                    <p className="erp-payroll-otadj-sheet-cap">
                      {t(`${KEY}.cappedHint`, {
                        applied: hoursLabel(appliedHours!),
                      })}
                    </p>
                  ) : null}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {note ? <p className="erp-payroll-otadj-note">{note}</p> : null}
      {meta ? <p className="erp-payroll-otadj-meta">{meta}</p> : null}
    </div>
  );
}

function ManualOtGridForm({
  form,
  saving,
  canSave,
  requiresNote,
  onChange,
  onSave,
  onCancel,
}: {
  form: GridFormState;
  saving: boolean;
  canSave: boolean;
  requiresNote: boolean;
  onChange: (next: GridFormState) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const noteMissing = requiresNote && !form.note.trim();

  return (
    <div
      className="erp-payroll-otadj-form erp-payroll-otadj-form--sheet"
      role="group"
      aria-label={t(`${KEY}.formLabel`)}
    >
      <p className="erp-payroll-otadj-sub m-0">{t(`${KEY}.gridHint`)}</p>
      <div className="erp-payroll-otadj-sheet erp-payroll-otadj-sheet--edit">
        <table className="erp-payroll-otadj-sheet-table">
          <thead>
            <tr>
              {CATEGORIES.map((category) => (
                <th key={category} scope="col" className="is-num">
                  {t(CATEGORY_LABEL_KEY[category])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {CATEGORIES.map((category, index) => (
                <td key={category} className="is-num erp-payroll-otadj-sheet-cell">
                  <InputNumber
                    autoFocus={index === 0}
                    controls={false}
                    step={0.5}
                    min={-744}
                    max={744}
                    precision={2}
                    value={form.hours[category]}
                    placeholder="0"
                    className="erp-payroll-otadj-sheet-input"
                    onChange={(value) =>
                      onChange({
                        ...form,
                        hours: {
                          ...form.hours,
                          [category]:
                            typeof value === 'number' ? value : null,
                        },
                      })
                    }
                    onPressEnter={onSave}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <label className="erp-payroll-otadj-field erp-payroll-otadj-field--note">
        <span>{t(`${KEY}.colNote`)}</span>
        <Input
          value={form.note}
          maxLength={500}
          placeholder={t(`${KEY}.notePlaceholder`)}
          status={noteMissing ? 'error' : undefined}
          onChange={(event) => onChange({ ...form, note: event.target.value })}
          onPressEnter={onSave}
        />
        <small className={noteMissing ? 'is-error' : undefined}>
          {t(`${KEY}.noteRequired`)}
        </small>
      </label>
      <div className="erp-payroll-otadj-form-actions">
        <Button size="small" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={!canSave || noteMissing}
          onClick={onSave}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function OtSummary({ data }: { data: PayrollOtBreakdown }): React.ReactNode {
  const { t } = useEpcTranslation();
  const rows = data.categories.filter(
    (row) => row.totalHours !== 0 || row.manualHours !== 0,
  );
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="erp-payroll-otadj-block erp-payroll-otadj-summary">
      <h4 className="erp-payroll-otadj-title">{t(`${KEY}.summaryTitle`)}</h4>
      <ul className="erp-payroll-otadj-sumlines">
        {rows.map((row) => (
          <li key={row.category}>
            <div className="min-w-0">
              <p className="erp-payroll-otadj-sumcat">
                {t(`${KEY}.summaryTotal`, {
                  category: t(CATEGORY_LABEL_KEY[row.category]),
                  total: hoursLabel(row.totalHours),
                })}
              </p>
              <p className="erp-payroll-otadj-sub">
                {t(`${KEY}.summarySplit`, {
                  system: hoursLabel(row.systemHours),
                  manual: signedHours(row.manualHours),
                })}
              </p>
            </div>
            <span className="erp-payroll-otadj-amount">
              {formatPayrollMoney(row.totalPay, { emptyZero: false })} ETB
            </span>
          </li>
        ))}
      </ul>
      <div className="erp-payroll-otadj-total">
        <div>
          <p className="erp-payroll-otadj-sumcat">{t(`${KEY}.totalPay`)}</p>
          <p className="erp-payroll-otadj-sub">
            {t(`${KEY}.totalPaySplit`, {
              system: formatPayrollMoney(data.totals.systemPay, {
                emptyZero: false,
              }),
              manual: formatPayrollMoney(data.totals.manualPay, {
                emptyZero: false,
              }),
            })}
          </p>
        </div>
        <strong>
          {formatPayrollMoney(data.totals.totalPay, { emptyZero: false })} ETB
        </strong>
      </div>
    </section>
  );
}
