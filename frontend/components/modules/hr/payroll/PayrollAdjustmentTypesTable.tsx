'use client';

import { useState } from 'react';
import { Button, Drawer, Form, Input, Radio, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PayrollAdjustmentKind,
  PayrollAdjustmentType,
} from '@/lib/api/payroll-adjustments';
import {
  usePayrollAdjustmentTypes,
  useSavePayrollAdjustmentType,
} from '@/lib/query/payroll-adjustments';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const KEY = 'hr.payroll.adjustmentTypes';

interface TypeForm {
  code: string;
  nameEn: string;
  nameZh?: string;
  kind: PayrollAdjustmentKind;
  taxable: boolean;
  pensionable: boolean;
  active: boolean;
}

/**
 * Payroll settings: the adjustment types HR can add to runs, as a simple table
 * with an edit drawer. Built-in Taxable bonus / Net bonus keep their kind and
 * flags (they use the existing bonus calculation).
 */
export default function PayrollAdjustmentTypesTable({
  readOnly = false,
}: {
  readOnly?: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const typesQuery = usePayrollAdjustmentTypes();
  const saveMutation = useSavePayrollAdjustmentType();
  const [form] = Form.useForm<TypeForm>();
  const [editing, setEditing] = useState<PayrollAdjustmentType | 'new' | null>(null);
  const kind = Form.useWatch('kind', form);
  const isBuiltIn = editing !== null && editing !== 'new' && Boolean(editing.systemField);
  const zh = locale === 'zh';

  function open(row: PayrollAdjustmentType | 'new'): void {
    setEditing(row);
    form.setFieldsValue(
      row === 'new'
        ? { code: '', nameEn: '', nameZh: '', kind: 'EARNING', taxable: true, pensionable: false, active: true }
        : {
            code: row.code,
            nameEn: row.nameEn,
            nameZh: row.nameZh ?? '',
            kind: row.kind,
            taxable: row.taxable,
            pensionable: row.pensionable,
            active: row.active,
          },
    );
  }

  async function save(): Promise<void> {
    if (!editing) {
      return;
    }
    try {
      const values = await form.validateFields();
      const deduction = values.kind === 'DEDUCTION';
      await saveMutation.mutateAsync({
        id: editing === 'new' ? null : editing.id,
        payload: {
          ...(editing === 'new' ? { code: values.code.trim() } : {}),
          nameEn: values.nameEn.trim(),
          nameZh: values.nameZh?.trim() || undefined,
          ...(isBuiltIn
            ? {}
            : {
                kind: values.kind,
                taxable: deduction ? false : values.taxable,
                pensionable: deduction ? false : values.pensionable,
              }),
          active: values.active,
        },
      });
      messageApi.success(t(`${KEY}.saved`));
      setEditing(null);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, t(`${KEY}.title`), messageApi, t);
    }
  }

  const yesNo = (value: boolean): string => (value ? t(`${KEY}.yes`) : t(`${KEY}.no`));

  const columns: ColumnsType<PayrollAdjustmentType> = [
    {
      title: t(`${KEY}.name`),
      key: 'name',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="erp-payroll-adj-type-name">
            {zh && row.nameZh ? row.nameZh : row.nameEn}
            {row.systemField ? (
              <Tag className="erp-payroll-adj-builtin">{t(`${KEY}.builtIn`)}</Tag>
            ) : null}
          </p>
          <p className="erp-payroll-adj-type-code">{row.code}</p>
        </div>
      ),
    },
    {
      title: t(`${KEY}.kind`),
      dataIndex: 'kind',
      width: 110,
      render: (value: PayrollAdjustmentKind) =>
        value === 'DEDUCTION'
          ? t('hr.payroll.adjustments.kindDeduction')
          : t('hr.payroll.adjustments.kindEarning'),
    },
    { title: t(`${KEY}.taxable`), dataIndex: 'taxable', width: 90, render: yesNo },
    { title: t(`${KEY}.pensionable`), dataIndex: 'pensionable', width: 110, render: yesNo },
    {
      title: t(`${KEY}.active`),
      dataIndex: 'active',
      width: 80,
      render: (value: boolean) => (
        <span className={value ? 'erp-payroll-dot erp-payroll-dot--on' : 'erp-payroll-dot'}>
          {yesNo(value)}
        </span>
      ),
    },
    ...(readOnly
      ? []
      : [
          {
            title: <span className="sr-only">{t(`${KEY}.edit`)}</span>,
            key: 'edit',
            width: 56,
            align: 'center' as const,
            render: (_: unknown, row: PayrollAdjustmentType) => (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label={`${t(`${KEY}.edit`)} ${row.nameEn}`}
                onClick={() => open(row)}
              />
            ),
          },
        ]),
  ];

  return (
    <div className="erp-payroll-adj-types">
      <Table<PayrollAdjustmentType>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={typesQuery.data ?? []}
        loading={typesQuery.isLoading}
        pagination={false}
      />
      {readOnly ? null : (
        <Button className="mt-3" icon={<PlusOutlined />} onClick={() => open('new')}>
          {t(`${KEY}.add`)}
        </Button>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        size={440}
        destroyOnHidden
        rootClassName="erp-payroll-modal"
        title={
          editing === 'new'
            ? t(`${KEY}.drawerNew`)
            : editing
              ? t(`${KEY}.drawerEdit`, { name: editing.nameEn })
              : ''
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {isBuiltIn ? (
            <ErpNotice tone="info" className="mb-4" title={t(`${KEY}.hint`)} />
          ) : null}
          <Form.Item
            name="code"
            label={t(`${KEY}.code`)}
            rules={[{ required: editing === 'new', whitespace: true, message: t(`${KEY}.codeRequired`) }]}
          >
            <Input maxLength={40} disabled={editing !== 'new'} className="erp-payroll-settings-mono" />
          </Form.Item>
          <Form.Item
            name="nameEn"
            label={t(`${KEY}.nameEn`)}
            rules={[{ required: true, whitespace: true, message: t(`${KEY}.nameRequired`) }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="nameZh" label={t(`${KEY}.nameZh`)}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="kind" label={t(`${KEY}.kind`)}>
            <Radio.Group disabled={isBuiltIn}>
              <Radio value="EARNING">{t('hr.payroll.adjustments.kindEarning')}</Radio>
              <Radio value="DEDUCTION">{t('hr.payroll.adjustments.kindDeduction')}</Radio>
            </Radio.Group>
          </Form.Item>
          {kind === 'DEDUCTION' ? (
            <p className="erp-payroll-modal-hint">{t(`${KEY}.deductionNote`)}</p>
          ) : (
            <>
              <Form.Item name="taxable" label={t(`${KEY}.taxable`)} valuePropName="checked">
                <Switch disabled={isBuiltIn} />
              </Form.Item>
              <Form.Item
                name="pensionable"
                label={t(`${KEY}.pensionable`)}
                valuePropName="checked"
                extra={t(`${KEY}.pensionNote`)}
              >
                <Switch disabled={isBuiltIn} />
              </Form.Item>
            </>
          )}
          <Form.Item name="active" label={t(`${KEY}.active`)} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
