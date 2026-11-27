'use client';

import { useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PayrollAdjustmentLine,
  PayrollCorrectionDirection,
  PayrollCorrectionLine,
  PayrollCorrectionTreatment,
} from '@/lib/api/payroll-adjustments';
import type { PayrollEntryDetail } from '@/lib/api/payroll.types';
import {
  useAddPayrollCorrectionLine,
  usePayrollAdjustmentLines,
  usePayrollAdjustmentTypes,
  usePayrollCorrectionLines,
  useRemovePayrollAdjustmentLine,
} from '@/lib/query/payroll-adjustments';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatPayrollMoney, parsePayrollMoney } from '@/lib/utils/payroll-display';
import { formatUserName } from '@/lib/utils/user-display';

const KEY = 'hr.payroll.correctionLines';

/** Types a manual correction line can use: missed bonus, severance pay, salary arrears, other. */
const CORRECTION_TYPE_CODES: readonly string[] = [
  'MISSED_BONUS',
  'SEVERANCE_PAY',
  'SALARY_ARREARS',
  'OTHER',
];

interface CorrectionLineForm {
  direction: PayrollCorrectionDirection;
  treatment: PayrollCorrectionTreatment;
  adjustmentTypeId: string;
  amount: number | null;
  note: string;
}

/** Signed money with an explicit + for increases. */
function signed(value: number): string {
  if (Math.abs(value) < 0.005) {
    return '0.00';
  }
  const text = formatPayrollMoney(Math.abs(value), { emptyZero: false });
  return value > 0 ? `+${text}` : `−${text}`;
}

/**
 * Correction run: one employee's paid vs corrected amount for every payroll
 * component, with the non-zero differences highlighted, and the manual
 * correction lines (missed bonus, severance, arrears, other) HR added.
 */
export default function PayrollCorrectionDrawer({
  runId,
  entry,
  editable,
  onClose,
}: {
  runId: string;
  entry: PayrollEntryDetail | null;
  /** The run is a correction run HR can still change (DRAFT / REVIEWED / SUBMITTED). */
  editable: boolean;
  onClose: () => void;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const linesQuery = usePayrollCorrectionLines(runId, entry?.employeeId ?? null, entry !== null);
  const manualQuery = usePayrollAdjustmentLines(runId, entry !== null);
  const typesQuery = usePayrollAdjustmentTypes(entry !== null && editable);
  const addMutation = useAddPayrollCorrectionLine(runId);
  const removeMutation = useRemovePayrollAdjustmentLine(runId);
  const [form] = Form.useForm<CorrectionLineForm>();
  const [addOpen, setAddOpen] = useState(false);

  const lines = linesQuery.data ?? [];
  const manualLines = (manualQuery.data ?? []).filter(
    (line) => line.isCorrectionLine && line.employeeId === entry?.employeeId,
  );
  const correctionTypes = (typesQuery.data ?? []).filter(
    (type) => type.active && !type.systemField && CORRECTION_TYPE_CODES.includes(type.code),
  );
  const typeName = (type: { nameEn: string; nameZh: string | null }): string =>
    locale === 'zh' && type.nameZh ? type.nameZh : type.nameEn;
  const net = parsePayrollMoney(entry?.deltaAmount ?? 0);

  const watchedTreatment = Form.useWatch('treatment', form);
  const watchedDirection = Form.useWatch('direction', form);

  function openAdd(): void {
    form.resetFields();
    form.setFieldsValue({ direction: 'OWED_TO_EMPLOYEE', treatment: 'TAXABLE' });
    setAddOpen(true);
  }

  async function saveLine(): Promise<void> {
    if (!entry) {
      return;
    }
    try {
      const values = await form.validateFields();
      await addMutation.mutateAsync({
        employeeId: entry.employeeId,
        adjustmentTypeId: values.adjustmentTypeId,
        direction: values.direction,
        treatment: values.treatment,
        amount: values.amount ?? 0,
        note: values.note.trim(),
      });
      messageApi.success(t(`${KEY}.manual.added`));
      setAddOpen(false);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, t(`${KEY}.manual.add`), messageApi, t);
    }
  }

  async function removeLine(line: PayrollAdjustmentLine): Promise<void> {
    try {
      await removeMutation.mutateAsync(line.id);
      messageApi.success(t(`${KEY}.manual.removed`));
    } catch (error) {
      notifyApiError(error, t(`${KEY}.manual.remove`), messageApi, t);
    }
  }

  const columns: ColumnsType<PayrollCorrectionLine> = [
    {
      title: t(`${KEY}.component`),
      dataIndex: 'component',
      render: (component: string) => t(`${KEY}.components.${component}`),
    },
    {
      title: t(`${KEY}.paid`),
      dataIndex: 'paidAmount',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className="erp-payroll-num">{formatPayrollMoney(value, { emptyZero: false })}</span>
      ),
    },
    {
      title: t(`${KEY}.corrected`),
      dataIndex: 'correctedAmount',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className="erp-payroll-num">{formatPayrollMoney(value, { emptyZero: false })}</span>
      ),
    },
    {
      title: t(`${KEY}.difference`),
      dataIndex: 'difference',
      align: 'right',
      width: 120,
      render: (value: number) => (
        <span className={`erp-payroll-num${Math.abs(value) >= 0.005 ? ' font-semibold' : ' erp-payroll-num--muted'}`}>
          {signed(value)}
        </span>
      ),
    },
  ];

  const manualColumns: ColumnsType<PayrollAdjustmentLine> = [
    {
      title: t(`${KEY}.manual.line`),
      key: 'line',
      render: (_, line) => (
        <div className="min-w-0">
          <p className="m-0 font-semibold">{typeName({ nameEn: line.typeNameEn, nameZh: line.typeNameZh })}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <Tag
              className={
                line.direction === 'OWED_TO_EMPLOYEE'
                  ? 'erp-payroll-rec-tag erp-payroll-rec-tag--pay'
                  : 'erp-payroll-rec-tag erp-payroll-rec-tag--recover'
              }
            >
              {line.direction === 'OWED_TO_EMPLOYEE'
                ? t(`${KEY}.manual.owedToEmployee`)
                : t(`${KEY}.manual.owedToCompany`)}
            </Tag>
            <Tag className="erp-payroll-rec-tag erp-payroll-adj-builtin">
              {line.treatment === 'TAXABLE' ? t(`${KEY}.manual.taxable`) : t(`${KEY}.manual.net`)}
              {line.treatment === 'TAXABLE' && line.pensionable ? ` · ${t(`${KEY}.manual.pensionable`)}` : ''}
            </Tag>
          </div>
          <p className="erp-payroll-muted-note erp-payroll-wrap">{line.note}</p>
        </div>
      ),
    },
    {
      title: t(`${KEY}.manual.amount`),
      key: 'amount',
      align: 'right',
      width: 120,
      render: (_, line) => (
        <span className="erp-payroll-num font-semibold">
          {line.direction === 'OWED_TO_COMPANY' ? '−' : '+'}
          {formatPayrollMoney(line.amount, { emptyZero: false })}
        </span>
      ),
    },
    ...(editable
      ? [
          {
            title: <span className="sr-only">{t(`${KEY}.manual.remove`)}</span>,
            key: 'remove',
            width: 56,
            align: 'center' as const,
            render: (_: unknown, line: PayrollAdjustmentLine) => (
              <Popconfirm
                title={t(`${KEY}.manual.removeConfirm`)}
                okText={t(`${KEY}.manual.remove`)}
                cancelText={t('common.cancel')}
                onConfirm={() => void removeLine(line)}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`${t(`${KEY}.manual.remove`)}: ${line.label}`}
                />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      size={640}
      destroyOnHidden
      rootClassName="erp-pe-drawer erp-payroll-modal"
      title={entry ? t(`${KEY}.drawerTitle`, { name: formatUserName(entry.employee) }) : ''}
    >
      {entry ? (
        <div className="erp-payroll-correction-net">
          <span>{t(`${KEY}.netDifference`)}</span>
          <strong className="erp-payroll-num">{signed(net)} ETB</strong>
        </div>
      ) : null}
      {linesQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table<PayrollCorrectionLine>
          rowKey="component"
          size="small"
          columns={columns}
          dataSource={lines}
          pagination={false}
          rowClassName={(row) =>
            Math.abs(row.difference) >= 0.005 ? 'erp-payroll-diff-row' : ''
          }
          locale={{ emptyText: t(`${KEY}.unchanged`) }}
        />
      )}

      <section className="mt-6">
        <header className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="erp-payroll-panel-title">{t(`${KEY}.manual.title`)}</h3>
            <p className="erp-payroll-panel-desc">{t(`${KEY}.manual.hint`)}</p>
          </div>
          {editable ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              {t(`${KEY}.manual.add`)}
            </Button>
          ) : null}
        </header>
        <Table<PayrollAdjustmentLine>
          rowKey="id"
          size="small"
          columns={manualColumns}
          dataSource={manualLines}
          loading={manualQuery.isLoading}
          pagination={false}
          locale={{ emptyText: t(`${KEY}.manual.empty`) }}
        />
      </section>

      <Modal
        open={addOpen}
        title={t(`${KEY}.manual.modalTitle`)}
        onCancel={() => setAddOpen(false)}
        onOk={() => void saveLine()}
        okText={t(`${KEY}.manual.add`)}
        confirmLoading={addMutation.isPending}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="direction" label={t(`${KEY}.manual.direction`)} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="OWED_TO_EMPLOYEE">{t(`${KEY}.manual.owedToEmployee`)}</Radio.Button>
              <Radio.Button value="OWED_TO_COMPANY">{t(`${KEY}.manual.owedToCompany`)}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="treatment" label={t(`${KEY}.manual.treatment`)} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="TAXABLE">{t(`${KEY}.manual.taxable`)}</Radio.Button>
              <Radio.Button value="NET">{t(`${KEY}.manual.net`)}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <ErpNotice
            tone="info"
            className="mb-4"
            title={
              watchedTreatment === 'NET'
                ? t(`${KEY}.manual.netHint`)
                : watchedDirection === 'OWED_TO_COMPANY'
                  ? t(`${KEY}.manual.taxableDeductionHint`)
                  : t(`${KEY}.manual.taxableHint`)
            }
          />
          <Form.Item
            name="adjustmentTypeId"
            label={t(`${KEY}.manual.type`)}
            rules={[{ required: true, message: t(`${KEY}.manual.typeRequired`) }]}
          >
            <Select
              placeholder={t(`${KEY}.manual.typePlaceholder`)}
              loading={typesQuery.isLoading}
              options={correctionTypes.map((type) => ({ value: type.id, label: typeName(type) }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t(`${KEY}.manual.amount`)}
            rules={[
              {
                validator: (_, value: number | null) =>
                  value == null || value <= 0
                    ? Promise.reject(new Error(t(`${KEY}.manual.amountRequired`)))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber className="w-full" min={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            name="note"
            label={t(`${KEY}.manual.note`)}
            rules={[{ required: true, whitespace: true, message: t(`${KEY}.manual.noteRequired`) }]}
          >
            <Input.TextArea rows={2} maxLength={500} placeholder={t(`${KEY}.manual.notePlaceholder`)} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
