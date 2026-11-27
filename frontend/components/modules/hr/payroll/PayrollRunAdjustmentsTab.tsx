'use client';

import { useMemo, useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PayrollAdjustmentLine,
  PayrollReconciliation,
} from '@/lib/api/payroll-adjustments';
import type { PayrollRunDetail } from '@/lib/api/payroll.types';
import {
  useAddPayrollAdjustmentLine,
  useOpenPayrollReconciliations,
  usePayrollAdjustmentLines,
  usePayrollAdjustmentTypes,
  usePayrollSettlementSuggestion,
  useRemovePayrollAdjustmentLine,
  useWaivePayrollReconciliation,
} from '@/lib/query/payroll-adjustments';
import { formatPayrollMoney, formatPayrollPeriod, parsePayrollMoney } from '@/lib/utils/payroll-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const KEY = 'hr.payroll.adjustments';
const REC = 'hr.payroll.reconciliation';

/** Runs whose adjustment lines can still change. */
const EDITABLE = new Set(['DRAFT', 'REVIEWED', 'SUBMITTED']);

interface LineForm {
  employeeId: string;
  adjustmentTypeId: string;
  amount: number | null;
  note: string;
  capOverrideReason?: string;
}

/** Same rule as the API: deductions above one third of the monthly wage need a reason. */
function deductionCap(monthlyWage: number): number {
  return Math.floor((Math.max(0, monthlyWage) / 3) * 100) / 100;
}

export default function PayrollRunAdjustmentsTab({
  run,
  canEdit,
  canWaive,
}: {
  run: PayrollRunDetail;
  canEdit: boolean;
  canWaive: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const editable = canEdit && EDITABLE.has(run.status) && run.type !== 'CORRECTION';
  const linesQuery = usePayrollAdjustmentLines(run.id);
  const typesQuery = usePayrollAdjustmentTypes();
  const reconciliationsQuery = useOpenPayrollReconciliations(run.type !== 'CORRECTION');
  const addMutation = useAddPayrollAdjustmentLine(run.id);
  const removeMutation = useRemovePayrollAdjustmentLine(run.id);
  const waiveMutation = useWaivePayrollReconciliation();

  const [form] = Form.useForm<LineForm>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settling, setSettling] = useState<PayrollReconciliation | null>(null);
  const [waiving, setWaiving] = useState<PayrollReconciliation | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const suggestionQuery = usePayrollSettlementSuggestion(run.id, settling?.id ?? null, drawerOpen);

  const entriesByEmployee = useMemo(
    () => new Map(run.entries.map((entry) => [entry.employeeId, entry])),
    [run.entries],
  );
  const reconciliations = useMemo(
    () => (reconciliationsQuery.data ?? []).filter((item) => entriesByEmployee.has(item.employeeId)),
    [reconciliationsQuery.data, entriesByEmployee],
  );
  const activeTypes = (typesQuery.data ?? []).filter((type) => type.active);
  const typeName = (type: { nameEn: string; nameZh: string | null }): string =>
    locale === 'zh' && type.nameZh ? type.nameZh : type.nameEn;

  // Live one-third check for deductions in the drawer.
  const watchedEmployee = Form.useWatch('employeeId', form);
  const watchedType = Form.useWatch('adjustmentTypeId', form);
  const watchedAmount = Form.useWatch('amount', form);
  const selectedType = activeTypes.find((type) => type.id === watchedType);
  const selectedEntry = watchedEmployee ? entriesByEmployee.get(watchedEmployee) : undefined;
  const wage = selectedEntry ? parsePayrollMoney(selectedEntry.basicSalary) : 0;
  const deductionsAfter =
    selectedEntry && selectedType?.kind === 'DEDUCTION'
      ? parsePayrollMoney(selectedEntry.adjustmentDeductions ?? 0) + (watchedAmount ?? 0)
      : 0;
  const overCap = selectedType?.kind === 'DEDUCTION' && deductionsAfter > deductionCap(wage) + 0.005;

  function openAdd(): void {
    setSettling(null);
    form.resetFields();
    setDrawerOpen(true);
  }

  function openSettle(item: PayrollReconciliation): void {
    setSettling(item);
    form.resetFields();
    form.setFieldsValue({
      employeeId: item.employeeId,
      note: `${item.correctionRunNumber}: ${formatPayrollPeriod(item.forMonth, item.forYear)}`,
    });
    setDrawerOpen(true);
  }

  // Prefill the suggested type and amount once the suggestion arrives.
  const suggestion = suggestionQuery.data;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (settling && suggestion && prefilledFor !== settling.id) {
    setPrefilledFor(settling.id);
    form.setFieldsValue({
      adjustmentTypeId: suggestion.suggestedTypeId ?? undefined,
      amount: suggestion.amount > 0 ? suggestion.amount : null,
    });
  }

  async function saveLine(): Promise<void> {
    try {
      const values = await form.validateFields();
      await addMutation.mutateAsync({
        employeeId: values.employeeId,
        adjustmentTypeId: values.adjustmentTypeId,
        amount: values.amount ?? 0,
        note: values.note.trim(),
        reconciliationId: settling?.id,
        capOverrideReason: overCap ? values.capOverrideReason?.trim() : undefined,
      });
      messageApi.success(t(`${KEY}.added`));
      setDrawerOpen(false);
      setSettling(null);
      setPrefilledFor(null);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, t(`${KEY}.add`), messageApi, t);
    }
  }

  async function waive(): Promise<void> {
    if (!waiving) {
      return;
    }
    try {
      await waiveMutation.mutateAsync({ id: waiving.id, reason: waiveReason.trim() });
      messageApi.success(t(`${REC}.waived`));
      setWaiving(null);
      setWaiveReason('');
    } catch (error) {
      notifyApiError(error, t(`${REC}.waive`), messageApi, t);
    }
  }

  const reconciliationColumns: ColumnsType<PayrollReconciliation> = [
    {
      title: t(`${KEY}.employee`),
      key: 'employee',
      render: (_, item) => (
        <div className="min-w-0">
          <p className="erp-payroll-employee-name truncate">{item.employeeName}</p>
          <p className="erp-payroll-employee-id">{item.employeeCode ?? '-'}</p>
        </div>
      ),
    },
    {
      title: t(`${REC}.period`),
      key: 'period',
      width: 150,
      render: (_, item) => (
        <div>
          <p className="m-0">{formatPayrollPeriod(item.forMonth, item.forYear)}</p>
          <Tag
            className={
              item.direction === 'OWED_TO_EMPLOYEE'
                ? 'erp-payroll-rec-tag erp-payroll-rec-tag--pay'
                : 'erp-payroll-rec-tag erp-payroll-rec-tag--recover'
            }
          >
            {item.direction === 'OWED_TO_EMPLOYEE'
              ? t(`${REC}.owedToEmployee`)
              : t(`${REC}.owedToCompany`)}
          </Tag>
        </div>
      ),
    },
    {
      title: t(`${REC}.amount`),
      dataIndex: 'amount',
      align: 'right',
      width: 120,
      render: (value: number) => <span className="erp-payroll-num">{formatPayrollMoney(value, { emptyZero: false })}</span>,
    },
    {
      title: t(`${REC}.remaining`),
      key: 'remaining',
      align: 'right',
      width: 160,
      render: (_, item) => (
        <div>
          <span className="erp-payroll-num font-semibold">
            {formatPayrollMoney(item.remaining, { emptyZero: false })}
          </span>
          {item.pendingAmount > 0 ? (
            <p className="erp-payroll-muted-note">
              {t(`${REC}.pending`, { amount: formatPayrollMoney(item.pendingAmount, { emptyZero: false }) })}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      title: <span className="sr-only">{t(`${REC}.settle`)}</span>,
      key: 'actions',
      width: 170,
      align: 'right',
      render: (_, item) => (
        <div className="flex justify-end gap-1">
          {editable ? (
            <Button size="small" type="primary" ghost disabled={item.remaining <= 0} onClick={() => openSettle(item)}>
              {t(`${REC}.settle`)}
            </Button>
          ) : null}
          {canWaive ? (
            <Button size="small" type="text" onClick={() => setWaiving(item)}>
              {t(`${REC}.waive`)}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const lineColumns: ColumnsType<PayrollAdjustmentLine> = [
    {
      title: t(`${KEY}.employee`),
      key: 'employee',
      width: 200,
      render: (_, line) => (
        <div className="min-w-0">
          <p className="erp-payroll-employee-name truncate">{line.employeeName}</p>
          <p className="erp-payroll-employee-id">{line.employeeCode ?? '-'}</p>
        </div>
      ),
    },
    {
      title: t(`${KEY}.type`),
      key: 'type',
      render: (_, line) => (
        <div className="min-w-0">
          <p className="m-0">{line.label}</p>
          <p className="erp-payroll-muted-note">
            {line.kind === 'DEDUCTION'
              ? t(`${KEY}.kindDeduction`)
              : line.taxable
                ? t(`${KEY}.taxable`)
                : t(`${KEY}.afterTax`)}
            {line.pensionable ? ` · ${t(`${KEY}.pensionable`)}` : ''}
          </p>
        </div>
      ),
    },
    {
      title: t(`${KEY}.amount`),
      key: 'amount',
      align: 'right',
      width: 130,
      render: (_, line) => (
        <span className="erp-payroll-num font-semibold">
          {line.kind === 'DEDUCTION' ? '−' : ''}
          {formatPayrollMoney(line.amount, { emptyZero: false })}
        </span>
      ),
    },
    {
      title: t(`${KEY}.note`),
      dataIndex: 'note',
      render: (note: string, line) => (
        <div className="min-w-0">
          <p className="m-0 erp-payroll-wrap">{note}</p>
          {line.capOverrideReason ? (
            <p className="erp-payroll-muted-note">{line.capOverrideReason}</p>
          ) : null}
        </div>
      ),
    },
    ...(editable
      ? [
          {
            title: <span className="sr-only">{t(`${KEY}.remove`)}</span>,
            key: 'remove',
            width: 56,
            align: 'center' as const,
            render: (_: unknown, line: PayrollAdjustmentLine) => (
              <Popconfirm
                title={t(`${KEY}.removeConfirm`)}
                okText={t(`${KEY}.remove`)}
                cancelText={t('common.cancel')}
                onConfirm={async () => {
                  try {
                    await removeMutation.mutateAsync(line.id);
                    messageApi.success(t(`${KEY}.removed`));
                  } catch (error) {
                    notifyApiError(error, t(`${KEY}.remove`), messageApi, t);
                  }
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`${t(`${KEY}.remove`)}: ${line.label}`}
                />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  const settlementHint = (() => {
    if (!settling || !suggestion) {
      return null;
    }
    if (suggestion.recovery) {
      if (suggestion.amount <= 0) {
        return t(`${REC}.suggestionCapUsed`);
      }
      return t(`${REC}.suggestionRecovery`, {
        amount: formatPayrollMoney(suggestion.amount, { emptyZero: false }),
        wage: formatPayrollMoney(suggestion.recovery.monthlyWage, { emptyZero: false }),
        count: suggestion.recovery.estimatedInstalments ?? 1,
      });
    }
    return t(`${REC}.suggestionPay`, {
      amount: formatPayrollMoney(suggestion.remaining, { emptyZero: false }),
    });
  })();

  return (
    <div className="erp-payroll-tab-stack">
      {run.type !== 'CORRECTION' ? (
        <section className="erp-pro-card erp-payroll-panel">
          <header className="erp-payroll-panel-head">
            <div className="min-w-0">
              <h3 className="erp-payroll-panel-title">{t(`${REC}.title`)}</h3>
              <p className="erp-payroll-panel-desc">{t(`${REC}.hint`)}</p>
            </div>
          </header>
          <Table<PayrollReconciliation>
            rowKey="id"
            size="small"
            columns={reconciliationColumns}
            dataSource={reconciliations}
            loading={reconciliationsQuery.isLoading}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t(`${REC}.empty`) }}
          />
        </section>
      ) : null}

      <section className="erp-pro-card erp-payroll-panel">
        <header className="erp-payroll-panel-head">
          <div className="min-w-0">
            <h3 className="erp-payroll-panel-title">{t(`${KEY}.title`)}</h3>
          </div>
          {editable ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              {t(`${KEY}.add`)}
            </Button>
          ) : null}
        </header>
        {!editable && canEdit && run.type !== 'CORRECTION' && !EDITABLE.has(run.status) ? (
          <ErpNotice tone="info" className="mb-3" title={t(`${KEY}.locked`)} />
        ) : null}
        <Table<PayrollAdjustmentLine>
          rowKey="id"
          size="small"
          columns={lineColumns}
          dataSource={linesQuery.data ?? []}
          loading={linesQuery.isLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t(`${KEY}.empty`) }}
        />
      </section>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSettling(null);
          setPrefilledFor(null);
        }}
        size={480}
        destroyOnHidden
        rootClassName="erp-payroll-modal"
        title={
          settling
            ? t(`${REC}.settleTitle`, { period: formatPayrollPeriod(settling.forMonth, settling.forYear) })
            : t(`${KEY}.drawerTitle`)
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDrawerOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={addMutation.isPending} onClick={() => void saveLine()}>
              {t(`${KEY}.add`)}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {settlementHint ? (
            <ErpNotice tone="info" className="mb-4" title={settlementHint} />
          ) : null}
          <Form.Item
            name="employeeId"
            label={t(`${KEY}.employee`)}
            rules={[{ required: true, message: t(`${KEY}.employeePlaceholder`) }]}
          >
            <Select
              showSearch
              disabled={Boolean(settling)}
              optionFilterProp="label"
              placeholder={t(`${KEY}.employeePlaceholder`)}
              options={run.entries.map((entry) => ({
                value: entry.employeeId,
                label: `${formatUserName(entry.employee)}${entry.employee.employeeId ? ` · ${entry.employee.employeeId}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="adjustmentTypeId"
            label={t(`${KEY}.type`)}
            rules={[{ required: true, message: t(`${KEY}.typePlaceholder`) }]}
          >
            <Select
              placeholder={t(`${KEY}.typePlaceholder`)}
              loading={typesQuery.isLoading}
              options={activeTypes
                .filter((type) =>
                  settling
                    ? type.kind === (settling.direction === 'OWED_TO_COMPANY' ? 'DEDUCTION' : 'EARNING')
                    : true,
                )
                .map((type) => ({
                  value: type.id,
                  label: `${typeName(type)} · ${
                    type.kind === 'DEDUCTION'
                      ? t(`${KEY}.kindDeduction`)
                      : type.taxable
                        ? t(`${KEY}.taxable`)
                        : t(`${KEY}.afterTax`)
                  }`,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t(`${KEY}.amount`)}
            rules={[
              {
                validator: (_, value: number | null) =>
                  value != null && value > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error(t(`${KEY}.amountRequired`))),
              },
            ]}
          >
            <InputNumber
              className="w-full"
              min={0.01}
              precision={2}
              max={settling ? suggestion?.remaining : undefined}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label={t(`${KEY}.note`)}
            rules={[{ required: true, whitespace: true, message: t(`${KEY}.noteRequired`) }]}
          >
            <Input.TextArea rows={2} maxLength={500} placeholder={t(`${KEY}.notePlaceholder`)} />
          </Form.Item>
          {overCap ? (
            <>
              <ErpNotice
                tone="warning"
                className="mb-3"
                title={t(`${KEY}.capWarning`, {
                  total: formatPayrollMoney(deductionsAfter, { emptyZero: false }),
                  cap: formatPayrollMoney(deductionCap(wage), { emptyZero: false }),
                })}
              />
              <Form.Item
                name="capOverrideReason"
                label={t(`${KEY}.capOverride`)}
                rules={[{ required: true, whitespace: true, message: t(`${KEY}.capOverride`) }]}
              >
                <Input maxLength={500} placeholder={t(`${KEY}.capOverridePlaceholder`)} />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Drawer>

      <Modal
        open={waiving !== null}
        title={t(`${REC}.waiveTitle`)}
        onCancel={() => {
          setWaiving(null);
          setWaiveReason('');
        }}
        onOk={() => void waive()}
        okButtonProps={{ disabled: waiveReason.trim().length < 5, danger: true }}
        okText={t(`${REC}.waive`)}
        confirmLoading={waiveMutation.isPending}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t(`${REC}.waiveHint`)}</p>
        {waiving ? (
          <p className="m-0 mb-3">
            {waiving.employeeName} · {formatPayrollPeriod(waiving.forMonth, waiving.forYear)} ·{' '}
            {formatPayrollMoney(waiving.remaining, { emptyZero: false })} ETB
          </p>
        ) : null}
        <Form layout="vertical">
          <Form.Item label={t(`${REC}.waiveReason`)} required>
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={waiveReason}
              onChange={(event) => setWaiveReason(event.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

