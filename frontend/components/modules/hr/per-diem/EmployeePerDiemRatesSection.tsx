'use client';

import { useEffect } from 'react';
import { Alert, Button, Form, InputNumber, Select, Switch, Table } from 'antd';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import type { SupportedCurrency } from '@/lib/api/per-diem.types';
import {
  useEmployeePerDiemRate,
  useMyEmployeePerDiemRate,
  useUpsertEmployeePerDiemRate,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';

type FormValues = {
  currency: SupportedCurrency;
} & Record<string, number | boolean | null | undefined>;

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * HR section for viewing and editing an employee's per-destination daily rates.
 */
export default function EmployeePerDiemRatesSection({
  employeeId,
  editable = false,
}: {
  employeeId: string;
  editable?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const currentUserQuery = useCurrentUser();
  const isSelf = currentUserQuery.data?.id === employeeId;
  const hrRateQuery = useEmployeePerDiemRate(
    employeeId,
    Boolean(employeeId) && !isSelf,
  );
  const selfRateQuery = useMyEmployeePerDiemRate(Boolean(employeeId) && isSelf);
  const rateQuery = isSelf ? selfRateQuery : hrRateQuery;
  const saveMutation = useUpsertEmployeePerDiemRate(employeeId);
  const currency =
    Form.useWatch('currency', form) ?? rateQuery.data?.currency ?? 'ETB';

  useEffect(() => {
    if (!rateQuery.data) {
      return;
    }
    const row = rateQuery.data;
    const values: FormValues = { currency: row.currency };
    for (const category of PER_DIEM_DESTINATION_CATEGORIES) {
      const { rate, active } = PER_DIEM_CATEGORY_FIELDS[category];
      values[rate] = toNumber(row[rate]);
      values[active] = row[active];
    }
    form.setFieldsValue(values);
  }, [form, rateQuery.data]);

  async function handleSave(values: FormValues): Promise<void> {
    try {
      await saveMutation.mutateAsync({
        currency: values.currency,
        americasRate: toNumber(values.americasRate),
        asiaRate: toNumber(values.asiaRate),
        domesticRate: toNumber(values.domesticRate),
        eastAfricaRate: toNumber(values.eastAfricaRate),
        europeRate: toNumber(values.europeRate),
        middleEastRate: toNumber(values.middleEastRate),
        otherAfricaRate: toNumber(values.otherAfricaRate),
        americasActive: Boolean(values.americasActive),
        asiaActive: Boolean(values.asiaActive),
        domesticActive: Boolean(values.domesticActive),
        eastAfricaActive: Boolean(values.eastAfricaActive),
        europeActive: Boolean(values.europeActive),
        middleEastActive: Boolean(values.middleEastActive),
        otherAfricaActive: Boolean(values.otherAfricaActive),
      });
      messageApi.success(t('hr.messages.employeePerDiemRatesSaved'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.employeePerDiemRatesSaveFailed'), messageApi);
    }
  }

  if (rateQuery.isLoading) {
    return (
      <SectionCard title={t('hr.section.employeePerDiemRates')} bodyClassName="px-3 py-4 sm:px-5">
        <p className="m-0 text-sm text-[var(--color-text-tertiary)]">
          {t('common.loading')}
        </p>
      </SectionCard>
    );
  }

  if (rateQuery.isError) {
    return (
      <Alert type="error" showIcon title={t('hr.messages.employeePerDiemRatesLoadFailed')} />
    );
  }

  const row = rateQuery.data;

  const tableData = PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
    const { rate, active, labelKey } = PER_DIEM_CATEGORY_FIELDS[category];
    return {
      key: category,
      category,
      label: t(labelKey),
      rateField: rate,
      activeField: active,
      rateValue: row ? toNumber(row[rate]) : null,
      activeValue: row ? row[active] : true,
    };
  });

  return (
    <SectionCard
      title={t('hr.section.employeePerDiemRates')}
      bodyClassName="px-3 py-4 sm:px-5"
      action={
        editable ? (
          <Button
            type="primary"
            loading={saveMutation.isPending}
            onClick={() => form.submit()}
            style={{ borderRadius: 0 }}
          >
            {t('common.save')}
          </Button>
        ) : null
      }
    >
      <p className="mb-4 mt-0 text-sm text-[var(--color-text-secondary)]">
        {t('hr.section.employeePerDiemRatesDescription')}
      </p>

      <Form form={form} layout="vertical" onFinish={(values) => void handleSave(values)}>
        {editable ? (
          <Form.Item
            name="currency"
            label={t('hr.form.currency')}
            className="mb-4 max-w-xs"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'ETB', label: 'ETB' },
                { value: 'USD', label: 'USD' },
                { value: 'CNY', label: 'CNY' },
              ]}
            />
          </Form.Item>
        ) : (
          <p className="mb-4 text-sm text-[var(--color-text-primary)]">
            {t('hr.form.currency')}: <strong>{row?.currency ?? 'ETB'}</strong>
          </p>
        )}

        <div className="overflow-x-auto">
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={tableData}
            columns={[
              {
                title: t('hr.form.destinationCategory'),
                dataIndex: 'label',
                key: 'label',
              },
              {
                title: t('hr.form.dailyRate'),
                key: 'rate',
                render: (_, record) =>
                  editable ? (
                    <Form.Item name={record.rateField} className="mb-0">
                      <InputNumber min={0} precision={2} className="w-full min-w-[120px]" />
                    </Form.Item>
                  ) : (
                    <span>
                      {record.rateValue != null
                        ? formatCurrencyAmount(record.rateValue, currency)
                        : '—'}
                    </span>
                  ),
              },
              {
                title: t('hr.form.active'),
                key: 'active',
                width: 100,
                render: (_, record) =>
                  editable ? (
                    <Form.Item
                      name={record.activeField}
                      valuePropName="checked"
                      className="mb-0"
                    >
                      <Switch />
                    </Form.Item>
                  ) : (
                    <span>{record.activeValue ? t('common.yes') : t('common.no')}</span>
                  ),
              },
            ]}
          />
        </div>
      </Form>
    </SectionCard>
  );
}
