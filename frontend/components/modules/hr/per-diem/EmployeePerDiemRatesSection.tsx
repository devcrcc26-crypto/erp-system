'use client';

import { useEffect } from 'react';
import { Alert, Button, Form, InputNumber, Select, Switch } from 'antd';
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
import {
  SectionCard,
  SubsectionHeader,
} from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { tokens } from '@/lib/theme/tokens';

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
  embedded = false,
}: {
  employeeId: string;
  editable?: boolean;
  embedded?: boolean;
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
    const loadingBody = (
      <p className="m-0 text-sm" style={{ color: tokens.colorTextTertiary }}>
        {t('common.loading')}
      </p>
    );
    if (embedded) {
      return loadingBody;
    }
    return (
      <SectionCard title={t('hr.section.employeePerDiemRates')} bodyClassName="px-3 py-4 sm:px-5">
        {loadingBody}
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

  const formContent = (
    <>
      {embedded ? (
        <SubsectionHeader
          title={t('hr.section.employeePerDiemRates')}
          description={t('hr.section.employeePerDiemRatesDescription')}
        />
      ) : (
        <p
          className="mb-4 mt-0 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('hr.section.employeePerDiemRatesDescription')}
        </p>
      )}

      <Form form={form} layout="vertical" onFinish={(values) => void handleSave(values)}>
        <div
          className={`mb-4 flex flex-wrap items-end gap-3 ${embedded ? 'justify-between' : ''}`}
        >
          {editable ? (
            <Form.Item
              name="currency"
              label={t('hr.form.currency')}
              className="mb-0 min-w-[140px] max-w-xs flex-1"
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
            <div className="min-w-[140px]">
              <p
                className="m-0 mb-1 text-xs font-medium uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('hr.form.currency')}
              </p>
              <p
                className="m-0 text-sm font-semibold"
                style={{ color: tokens.colorTextPrimary }}
              >
                {row?.currency ?? 'ETB'}
              </p>
            </div>
          )}

          {editable && embedded ? (
            <Button
              type="primary"
              loading={saveMutation.isPending}
              onClick={() => form.submit()}
              style={{ borderRadius: 0 }}
            >
              {t('common.save')}
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)]">
          <DataTable
            rowKey="key"
            className="erp-pro-table"
            size="small"
            pagination={false}
            scroll={false}
            dataSource={tableData}
            columns={[
              {
                title: t('hr.form.destinationCategory'),
                dataIndex: 'label',
                key: 'label',
                render: (value: string) => (
                  <span className="text-sm font-medium">{value}</span>
                ),
              },
              {
                title: t('hr.form.dailyRate'),
                key: 'rate',
                width: 160,
                align: 'right',
                render: (_, record) =>
                  editable ? (
                    <Form.Item name={record.rateField} className="mb-0">
                      <InputNumber
                        min={0}
                        precision={2}
                        className="w-full min-w-[120px]"
                      />
                    </Form.Item>
                  ) : (
                    <span className="text-sm font-medium">
                      {record.rateValue != null
                        ? formatCurrencyAmount(record.rateValue, currency)
                        : '—'}
                    </span>
                  ),
              },
              {
                title: t('hr.form.active'),
                key: 'active',
                width: 120,
                align: 'center',
                render: (_, record) =>
                  editable ? (
                    <Form.Item
                      name={record.activeField}
                      valuePropName="checked"
                      className="mb-0 flex justify-center"
                    >
                      <Switch />
                    </Form.Item>
                  ) : (
                    <StatusBadge
                      label={
                        record.activeValue ? t('common.active') : t('common.inactive')
                      }
                      variant={record.activeValue ? 'approved' : 'draft'}
                    />
                  ),
              },
            ]}
          />
        </div>
      </Form>
    </>
  );

  if (embedded) {
    return <div className="flex flex-col gap-2">{formContent}</div>;
  }

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
      {formContent}
    </SectionCard>
  );
}
