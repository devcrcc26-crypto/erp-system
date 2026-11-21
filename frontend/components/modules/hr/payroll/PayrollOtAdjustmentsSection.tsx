'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Input, InputNumber, Popconfirm, Select, Spin, Tag, Tooltip } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
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

const KEY = 'hr.payroll.otAdjust';

const CATEGORIES: readonly PayrollOtCategory[] = ['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'];

/** Same labels as the overtime module (Normal OT, Evening OT, Weekend, Holiday). */
const CATEGORY_LABEL_KEY: Record<PayrollOtCategory, string> = {
  NORMAL: 'hr.overtimeCategory.regular',
  EVENING: 'hr.overtimeCategory.night',
  SUNDAY: 'hr.overtimeCategory.weekend',
  HOLIDAY: 'hr.overtimeCategory.holiday',
};

interface DraftRow {
  /** Saved adjustment id, or a local key for a new row. */
  key: string;
  savedId: string | null;
  category: PayrollOtCategory;
  hours: number | null;
  note: string;
}

function draftFromSaved(adjustment: PayrollOtAdjustment): DraftRow {
  return {
    key: adjustment.id,
    savedId: adjustment.id,
    category: adjustment.otCategory,
    hours: adjustment.hours,
    note: adjustment.note ?? '',
  };
}

function hoursLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Payroll run entry: system OT (approved overtime sheets) and manual OT
 * adjustments for paper-based records, shown separately, plus the combined
 * totals. Manual rows are always labelled; edits are saved per row (audited).
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
      <section className="erp-payroll-otadj">
        <Spin size="small" />
      </section>
    );
  }
  if (query.isError || !data) {
    return (
      <section className="erp-payroll-otadj">
        <Alert type="error" showIcon title={t(`${KEY}.loadFailed`)} />
      </section>
    );
  }

  return (
    <section
      className="erp-payroll-otadj"
      aria-label={t('hr.payroll.entry.otBreakdown')}
    >
      <SystemOtTable data={data} />
      <ManualOtEditor
        // Re-seed local rows whenever the saved set changes.
        key={data.adjustments.map((row) => `${row.id}:${row.updatedAt}`).join('|')}
        runId={runId}
        employeeId={employeeId}
        data={data}
        canEdit={canEdit && data.editable && data.paidDays > 0}
      />
      <OtSummary data={data} />
    </section>
  );
}

function SystemOtTable({ data }: { data: PayrollOtBreakdown }): React.ReactNode {
  const { t } = useEpcTranslation();
  const rows = data.categories.filter((row) => row.systemHours !== 0);
  return (
    <div className="erp-payroll-otadj-block">
      <div className="erp-payroll-otadj-head">
        <h4 className="erp-payroll-otadj-title">{t(`${KEY}.systemTitle`)}</h4>
        {data.overtimeSheetId && rows.length > 0 ? (
          <Link
            href={`/hr/overtime/${data.overtimeSheetId}`}
            className="erp-payroll-entry-link"
          >
            {t(`${KEY}.viewDates`)}
          </Link>
        ) : null}
      </div>
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
        </table>
      )}
    </div>
  );
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
  const [rows, setRows] = useState<DraftRow[]>(() => data.adjustments.map(draftFromSaved));
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savedById = useMemo(
    () => new Map(data.adjustments.map((row) => [row.id, row])),
    [data.adjustments],
  );
  const usedCategories = new Set(rows.map((row) => row.category));
  const freeCategories = CATEGORIES.filter((category) => !usedCategories.has(category));

  function patch(key: string, change: Partial<DraftRow>): void {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function isDirty(row: DraftRow): boolean {
    const saved = row.savedId ? savedById.get(row.savedId) : null;
    if (!saved) return true;
    return (
      saved.hours !== row.hours ||
      (saved.note ?? '') !== row.note ||
      saved.otCategory !== row.category
    );
  }

  function problem(row: DraftRow): string | null {
    if (row.hours == null || row.hours === 0) return t(`${KEY}.hoursRequired`);
    if (!row.note.trim()) return t(`${KEY}.noteRequired`);
    return null;
  }

  async function save(row: DraftRow): Promise<void> {
    if (problem(row) || !isDirty(row)) return;
    setSavingKey(row.key);
    try {
      await upsert.mutateAsync({
        employeeId,
        otCategory: row.category,
        hours: row.hours!,
        note: row.note.trim(),
      });
      messageApi.success(t(`${KEY}.saved`));
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.saveFailed`), messageApi, t);
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteRow(row: DraftRow): Promise<void> {
    if (!row.savedId) {
      setRows((current) => current.filter((item) => item.key !== row.key));
      return;
    }
    try {
      await remove.mutateAsync(row.savedId);
      messageApi.success(t(`${KEY}.deleted`));
    } catch (error: unknown) {
      notifyApiError(error, t(`${KEY}.deleteFailed`), messageApi, t);
    }
  }

  function addRow(): void {
    const category = freeCategories[0];
    if (!category) return;
    setRows((current) => [
      ...current,
      { key: `new-${category}-${Date.now()}`, savedId: null, category, hours: null, note: '' },
    ]);
  }

  return (
    <div className="erp-payroll-otadj-block erp-payroll-otadj-block--manual">
      <div className="erp-payroll-otadj-head">
        <h4 className="erp-payroll-otadj-title">
          {t(`${KEY}.manualTitle`)}
          <Tag className="erp-payroll-otadj-tag">{t(`${KEY}.manualTag`)}</Tag>
        </h4>
        {canEdit ? (
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={addRow}
            disabled={freeCategories.length === 0}
          >
            {t(`${KEY}.addAdjustment`)}
          </Button>
        ) : null}
      </div>

      {!canEdit && data.paidDays === 0 ? (
        <p className="erp-payroll-otadj-empty">{t(`${KEY}.zeroDays`)}</p>
      ) : null}
      {!data.editable ? (
        <p className="erp-payroll-otadj-empty">
          {t(`${KEY}.locked`, { status: data.runStatus })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="erp-payroll-otadj-empty">{t(`${KEY}.noManual`)}</p>
      ) : (
        <ul className="erp-payroll-otadj-rows">
          {rows.map((row) => {
            const saved = row.savedId ? savedById.get(row.savedId) : undefined;
            const rowProblem = problem(row);
            const dirty = isDirty(row);
            const categoryOptions = [row.category, ...freeCategories].map((category) => ({
              value: category,
              label: t(CATEGORY_LABEL_KEY[category]),
            }));
            const capped =
              saved && saved.appliedHours !== saved.hours ? saved.appliedHours : null;
            return (
              <li key={row.key} className="erp-payroll-otadj-row">
                <div className="erp-payroll-otadj-fields">
                  <label className="erp-payroll-otadj-field">
                    <span>{t(`${KEY}.colCategory`)}</span>
                    {canEdit && !row.savedId ? (
                      <Select
                        size="small"
                        value={row.category}
                        options={categoryOptions}
                        onChange={(category: PayrollOtCategory) => patch(row.key, { category })}
                      />
                    ) : (
                      <strong>{t(CATEGORY_LABEL_KEY[row.category])}</strong>
                    )}
                  </label>
                  <label className="erp-payroll-otadj-field erp-payroll-otadj-field--hours">
                    <span>{t(`${KEY}.colHours`)}</span>
                    {canEdit ? (
                      <InputNumber
                        size="small"
                        step={0.5}
                        min={-744}
                        max={744}
                        precision={2}
                        value={row.hours}
                        onChange={(value) =>
                          patch(row.key, { hours: typeof value === 'number' ? value : null })
                        }
                        onPressEnter={() => void save(row)}
                        className="w-full"
                      />
                    ) : (
                      <strong className="tabular-nums">{hoursLabel(row.hours ?? 0)}</strong>
                    )}
                  </label>
                  <label className="erp-payroll-otadj-field erp-payroll-otadj-field--note">
                    <span>{t(`${KEY}.colNote`)}</span>
                    {canEdit ? (
                      <Input
                        size="small"
                        value={row.note}
                        maxLength={500}
                        placeholder={t(`${KEY}.notePlaceholder`)}
                        onChange={(event) => patch(row.key, { note: event.target.value })}
                        onPressEnter={() => void save(row)}
                        status={dirty && row.hours ? (row.note.trim() ? undefined : 'error') : undefined}
                      />
                    ) : (
                      <span>{row.note || '-'}</span>
                    )}
                  </label>
                  {canEdit ? (
                    <div className="erp-payroll-otadj-actions">
                      <Tooltip title={rowProblem && dirty ? rowProblem : undefined}>
                        <Button
                          size="small"
                          type="primary"
                          icon={<SaveOutlined />}
                          disabled={!dirty || Boolean(rowProblem)}
                          loading={savingKey === row.key}
                          onClick={() => void save(row)}
                        >
                          {t('common.save')}
                        </Button>
                      </Tooltip>
                      {row.savedId ? (
                        <Popconfirm
                          title={t(`${KEY}.deleteConfirm`)}
                          okText={t('common.delete')}
                          cancelText={t('common.cancel')}
                          okButtonProps={{ danger: true }}
                          onConfirm={() => deleteRow(row)}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={t('common.delete')}
                          />
                        </Popconfirm>
                      ) : (
                        <Button
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={t('common.delete')}
                          onClick={() => void deleteRow(row)}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
                {saved ? (
                  <p className="erp-payroll-otadj-meta">
                    <EditOutlined aria-hidden />
                    {t(`${KEY}.addedBy`, {
                      name: formatUserName(saved.createdBy),
                      date: dayjs(saved.createdAt).format('YYYY-MM-DD HH:mm'),
                    })}
                    {saved.updatedAt !== saved.createdAt
                      ? ` · ${t(`${KEY}.updatedBy`, {
                          name: formatUserName(saved.updatedBy),
                          date: dayjs(saved.updatedAt).format('YYYY-MM-DD HH:mm'),
                        })}`
                      : null}
                    {' · '}
                    {formatPayrollMoney(saved.amount, { emptyZero: false })} ETB
                    {capped != null
                      ? ` · ${t(`${KEY}.cappedHint`, { applied: hoursLabel(capped) })}`
                      : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
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
    <div className="erp-payroll-otadj-block erp-payroll-otadj-summary">
      <h4 className="erp-payroll-otadj-title">{t(`${KEY}.summaryTitle`)}</h4>
      <ul className="erp-payroll-ot-lines">
        {rows.map((row) => (
          <li key={row.category}>
            <span>
              {t(`${KEY}.summaryLine`, {
                category: t(CATEGORY_LABEL_KEY[row.category]),
                total: hoursLabel(row.totalHours),
                system: hoursLabel(row.systemHours),
                manual: hoursLabel(row.manualHours),
              })}
            </span>
            <span>{formatPayrollMoney(row.totalPay, { emptyZero: false })} ETB</span>
          </li>
        ))}
        <li className="erp-payroll-ot-total">
          <span>
            {t(`${KEY}.totalPay`)}
            <small className="erp-payroll-otadj-split">
              {t(`${KEY}.totalPaySplit`, {
                system: formatPayrollMoney(data.totals.systemPay, { emptyZero: false }),
                manual: formatPayrollMoney(data.totals.manualPay, { emptyZero: false }),
              })}
            </small>
          </span>
          <span>{formatPayrollMoney(data.totals.totalPay, { emptyZero: false })} ETB</span>
        </li>
      </ul>
    </div>
  );
}
