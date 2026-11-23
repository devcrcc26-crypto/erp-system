'use client';

import { useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Input, InputNumber, Popconfirm, Segmented, Spin, Tag } from 'antd';
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

const CATEGORIES: readonly PayrollOtCategory[] = ['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'];

/** Same labels as the overtime module (Normal OT, Evening OT, Weekend, Holiday). */
const CATEGORY_LABEL_KEY: Record<PayrollOtCategory, string> = {
  NORMAL: 'hr.overtimeCategory.regular',
  EVENING: 'hr.overtimeCategory.night',
  SUNDAY: 'hr.overtimeCategory.weekend',
  HOLIDAY: 'hr.overtimeCategory.holiday',
};

function hoursLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function signedHours(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${hoursLabel(Math.abs(value))}`;
}

/**
 * Overtime tab of a payroll entry: system OT (approved overtime sheets) and
 * manual adjustments for paper-based records, kept apart, plus the combined
 * totals. Manual rows are added / edited one at a time and saved per row
 * (each save is audited and reprices the entry).
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
              <th scope="col" className="is-num">{t(`${KEY}.colHours`)}</th>
              <th scope="col" className="is-num">{t(`${KEY}.colPay`)}</th>
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

interface FormState {
  /** Adjustment being edited, or 'new'. */
  target: string;
  category: PayrollOtCategory;
  hours: number | null;
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
  const [form, setForm] = useState<FormState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  useReportDirty(
    'ot-adjustment',
    form != null && (form.hours != null || form.note.trim() !== ''),
  );

  const used = new Set(data.adjustments.map((row) => row.otCategory));
  const freeCategories = CATEGORIES.filter((category) => !used.has(category));

  function startAdd(): void {
    const category = freeCategories[0];
    if (category) {
      setForm({ target: 'new', category, hours: null, note: '' });
    }
  }

  function startEdit(adjustment: PayrollOtAdjustment): void {
    setForm({
      target: adjustment.id,
      category: adjustment.otCategory,
      hours: adjustment.hours,
      note: adjustment.note ?? '',
    });
  }

  async function save(): Promise<void> {
    if (!form || form.hours == null || form.hours === 0 || !form.note.trim()) return;
    try {
      await upsert.mutateAsync({
        employeeId,
        otCategory: form.category,
        hours: form.hours,
        note: form.note.trim(),
      });
      messageApi.success(t(`${KEY}.saved`));
      setForm(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    }
  }

  async function deleteAdjustment(adjustment: PayrollOtAdjustment): Promise<void> {
    setDeletingId(adjustment.id);
    try {
      await remove.mutateAsync(adjustment.id);
      messageApi.success(t(`${KEY}.deleted`));
      if (form?.target === adjustment.id) setForm(null);
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.deleteFailed`), messageApi, t);
    } finally {
      setDeletingId(null);
    }
  }

  const lockedReason = !data.editable
    ? t(`${KEY}.locked`, { status: data.runStatus })
    : data.paidDays === 0
      ? t(`${KEY}.zeroDays`)
      : null;

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
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={startAdd}
            disabled={freeCategories.length === 0}
            title={freeCategories.length === 0 ? t(`${KEY}.allCategoriesUsed`) : undefined}
          >
            {t(`${KEY}.addAdjustment`)}
          </Button>
        ) : null}
      </header>

      {lockedReason ? <p className="erp-payroll-otadj-empty">{lockedReason}</p> : null}

      {form?.target === 'new' ? (
        <AdjustmentForm
          form={form}
          categories={freeCategories}
          saving={upsert.isPending}
          onChange={setForm}
          onSave={() => void save()}
          onCancel={() => setForm(null)}
        />
      ) : null}

      {data.adjustments.length === 0 && form?.target !== 'new' ? (
        <div className="erp-payroll-otadj-placeholder">
          <p>{t(`${KEY}.noManual`)}</p>
          {canEdit ? <p className="erp-payroll-otadj-sub">{t(`${KEY}.noManualHint`)}</p> : null}
        </div>
      ) : (
        <ul className="erp-payroll-otadj-rows">
          {data.adjustments.map((adjustment) =>
            form?.target === adjustment.id ? (
              <li key={adjustment.id}>
                <AdjustmentForm
                  form={form}
                  categories={[adjustment.otCategory]}
                  saving={upsert.isPending}
                  onChange={setForm}
                  onSave={() => void save()}
                  onCancel={() => setForm(null)}
                />
              </li>
            ) : (
              <AdjustmentRow
                key={adjustment.id}
                adjustment={adjustment}
                canEdit={canEdit && !form}
                deleting={deletingId === adjustment.id}
                onEdit={() => startEdit(adjustment)}
                onDelete={() => deleteAdjustment(adjustment)}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function AdjustmentRow({
  adjustment,
  canEdit,
  deleting,
  onEdit,
  onDelete,
}: {
  adjustment: PayrollOtAdjustment;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const capped = adjustment.appliedHours !== adjustment.hours;
  const edited = adjustment.updatedAt !== adjustment.createdAt;
  return (
    <li className="erp-payroll-otadj-row">
      <div className="erp-payroll-otadj-row-main">
        <span className="erp-payroll-otadj-cat">{t(CATEGORY_LABEL_KEY[adjustment.otCategory])}</span>
        <span
          className={`erp-payroll-otadj-hours${adjustment.hours < 0 ? ' is-negative' : ''}`}
        >
          {t(`${KEY}.hoursValue`, { hours: signedHours(adjustment.hours) })}
        </span>
        <span className="erp-payroll-otadj-amount">
          {formatPayrollMoney(adjustment.amount, { emptyZero: false })} ETB
        </span>
        {canEdit ? (
          <span className="erp-payroll-otadj-row-actions">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={onEdit}
              aria-label={t(`${KEY}.edit`)}
            />
            <Popconfirm
              title={t(`${KEY}.deleteConfirm`)}
              okText={t('common.delete')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button
                size="small"
                type="text"
                danger
                loading={deleting}
                icon={<DeleteOutlined />}
                aria-label={t('common.delete')}
              />
            </Popconfirm>
          </span>
        ) : null}
      </div>
      <p className="erp-payroll-otadj-note">{adjustment.note || '—'}</p>
      <p className="erp-payroll-otadj-meta">
        {edited
          ? t(`${KEY}.updatedBy`, {
              name: formatUserName(adjustment.updatedBy),
              date: dayjs(adjustment.updatedAt).format('YYYY-MM-DD HH:mm'),
            })
          : t(`${KEY}.addedBy`, {
              name: formatUserName(adjustment.createdBy),
              date: dayjs(adjustment.createdAt).format('YYYY-MM-DD HH:mm'),
            })}
        {capped
          ? ` · ${t(`${KEY}.cappedHint`, { applied: hoursLabel(adjustment.appliedHours) })}`
          : null}
      </p>
    </li>
  );
}

function AdjustmentForm({
  form,
  categories,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState;
  /** Categories that can be chosen (one when editing). */
  categories: readonly PayrollOtCategory[];
  saving: boolean;
  onChange: (next: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const hoursMissing = form.hours == null || form.hours === 0;
  const noteMissing = !form.note.trim();
  const isNew = form.target === 'new';
  return (
    <div className="erp-payroll-otadj-form" role="group" aria-label={t(`${KEY}.formLabel`)}>
      <div className="erp-payroll-otadj-field">
        <span>{t(`${KEY}.colCategory`)}</span>
        {isNew && categories.length > 1 ? (
          <Segmented
            size="small"
            value={form.category}
            options={categories.map((category) => ({
              value: category,
              label: t(CATEGORY_LABEL_KEY[category]),
            }))}
            onChange={(value) => onChange({ ...form, category: value as PayrollOtCategory })}
          />
        ) : (
          <strong>{t(CATEGORY_LABEL_KEY[form.category])}</strong>
        )}
      </div>
      <div className="erp-payroll-otadj-form-row">
        <label className="erp-payroll-otadj-field erp-payroll-otadj-field--hours">
          <span>{t(`${KEY}.colHours`)}</span>
          <InputNumber
            autoFocus
            step={0.5}
            min={-744}
            max={744}
            precision={2}
            value={form.hours}
            placeholder="0"
            onChange={(value) =>
              onChange({ ...form, hours: typeof value === 'number' ? value : null })
            }
            onPressEnter={onSave}
            className="w-full"
          />
          <small>{t(`${KEY}.hoursHint`)}</small>
        </label>
        <label className="erp-payroll-otadj-field erp-payroll-otadj-field--note">
          <span>{t(`${KEY}.colNote`)}</span>
          <Input
            value={form.note}
            maxLength={500}
            placeholder={t(`${KEY}.notePlaceholder`)}
            status={!hoursMissing && noteMissing ? 'error' : undefined}
            onChange={(event) => onChange({ ...form, note: event.target.value })}
            onPressEnter={onSave}
          />
          <small className={!hoursMissing && noteMissing ? 'is-error' : undefined}>
            {t(`${KEY}.noteRequired`)}
          </small>
        </label>
      </div>
      <div className="erp-payroll-otadj-form-actions">
        <Button size="small" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={hoursMissing || noteMissing}
          onClick={onSave}
        >
          {isNew ? t(`${KEY}.addButton`) : t('common.save')}
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
              system: formatPayrollMoney(data.totals.systemPay, { emptyZero: false }),
              manual: formatPayrollMoney(data.totals.manualPay, { emptyZero: false }),
            })}
          </p>
        </div>
        <strong>{formatPayrollMoney(data.totals.totalPay, { emptyZero: false })} ETB</strong>
      </div>
    </section>
  );
}
