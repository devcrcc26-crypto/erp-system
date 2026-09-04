'use client';

import { useEffect, useRef } from 'react';
import { Alert, Button, Form, InputNumber, Select, Space, Spin, Switch } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { Wallet } from 'lucide-react';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
  type PerDiemDestinationCategory,
} from '@/lib/constants/per-diem-destination-categories';
import type { SupportedCurrency } from '@/lib/api/per-diem.types';
import {
  useEmployeePerDiemRate,
  useMyEmployeePerDiemRate,
  useUpsertEmployeePerDiemRate,
} from '@/lib/query/per-diem';
import { useCurrencyRates } from '@/lib/query/currency';
import { useCurrentUser } from '@/lib/query/profile';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import {
  convertCurrencyAmount,
  roundCurrencyAmount,
} from '@/lib/utils/currency-convert';

type FormValues = {
  currency: SupportedCurrency;
} & Record<string, number | boolean | null | undefined>;

const RATE_FIELDS = PER_DIEM_DESTINATION_CATEGORIES.map(
  (category) => PER_DIEM_CATEGORY_FIELDS[category].rate,
);

const CATEGORY_ACCENT: Record<PerDiemDestinationCategory, string> = {
  Americas: '#2563eb',
  Asia: '#7c3aed',
  Domestic: '#1d9e75',
  'East Africa': '#0d9488',
  Europe: '#0369a1',
  'Middle East': '#d4610a',
  'Other Africa': '#64748b',
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function PerDiemProfileSection({
  title,
  action,
  children,
  bodyClassName = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {action ? <div className="erp-employee-section-extra">{action}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function PerDiemRateCard({
  category,
  label,
  rateField,
  activeField,
  accent,
  currency,
  editable,
  rateValue,
  activeValue,
  form,
  dailyRateLabel,
  activeLabel,
  inactiveLabel,
}: {
  category: PerDiemDestinationCategory;
  label: string;
  rateField: string;
  activeField: string;
  accent: string;
  currency: string;
  editable: boolean;
  rateValue: number | null;
  activeValue: boolean;
  form: FormInstance<FormValues>;
  dailyRateLabel: string;
  activeLabel: string;
  inactiveLabel: string;
}): React.ReactNode {
  const watchedActive = Form.useWatch(activeField, form);
  const isActive = editable ? watchedActive !== false : activeValue;

  return (
    <article
      className={`erp-per-diem-rate-card${!isActive ? ' erp-per-diem-rate-card--inactive' : ''}`}
    >
      <div className="erp-per-diem-rate-card-head">
        <span
          className="erp-per-diem-rate-dot"
          style={{ background: isActive ? accent : '#cbd5e1' }}
          aria-hidden
        />
        <p className="erp-per-diem-rate-label">{label}</p>
        {editable ? (
          <Form.Item
            name={activeField}
            valuePropName="checked"
            className="mb-0 ms-auto"
          >
            <Switch size="small" />
          </Form.Item>
        ) : (
          <div className="ms-auto">
            <StatusBadge
              label={activeValue ? activeLabel : inactiveLabel}
              variant={activeValue ? 'success' : 'default'}
            />
          </div>
        )}
      </div>

      {editable ? (
        <Space.Compact className="erp-per-diem-rate-input w-full">
          <Form.Item name={rateField} noStyle>
            <InputNumber min={0} precision={2} className="w-full" />
          </Form.Item>
          <Button disabled className="erp-per-diem-rate-addon">
            {currency}
          </Button>
        </Space.Compact>
      ) : (
        <p className="erp-per-diem-rate-value">
          {rateValue != null ? formatCurrencyAmount(rateValue, currency) : '-'}
        </p>
      )}

      <p className="erp-per-diem-rate-meta">{dailyRateLabel}</p>
      <span className="sr-only">{category}</span>
    </article>
  );
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
  const ratesQuery = useCurrencyRates(editable);
  const currency =
    Form.useWatch('currency', form) ?? rateQuery.data?.currency ?? 'ETB';
  const previousCurrencyRef = useRef<SupportedCurrency | null>(null);

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
    previousCurrencyRef.current = row.currency;
  }, [form, rateQuery.data]);

  function convertRatesToCurrency(next: SupportedCurrency): void {
    const previous = previousCurrencyRef.current;
    if (!previous || previous === next) {
      previousCurrencyRef.current = next;
      return;
    }

    if (!ratesQuery.data) {
      messageApi.warning(t('hr.messages.currencyRatesUnavailable'));
      previousCurrencyRef.current = next;
      return;
    }

    const updates: Partial<FormValues> = {};
    let convertedCount = 0;

    for (const field of RATE_FIELDS) {
      const current = toNumber(form.getFieldValue(field));
      if (current == null) {
        continue;
      }
      const converted = convertCurrencyAmount(
        current,
        previous,
        next,
        ratesQuery.data,
      );
      if (converted == null) {
        messageApi.warning(t('hr.messages.currencyRatesUnavailable'));
        previousCurrencyRef.current = next;
        return;
      }
      updates[field] = roundCurrencyAmount(converted);
      convertedCount += 1;
    }

    if (convertedCount > 0) {
      form.setFieldsValue(updates);
    }
    previousCurrencyRef.current = next;
  }

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
      notifyApiError(
        error,
        t('hr.messages.employeePerDiemRatesSaveFailed'),
        messageApi,
      );
    }
  }

  if (rateQuery.isLoading) {
    const loadingBody = (
      <div className="flex justify-center py-10">
        <Spin />
      </div>
    );
    if (embedded) {
      return loadingBody;
    }
    return (
      <div className="erp-per-diem-profile">
        <PerDiemProfileSection title={t('hr.section.employeePerDiemRates')}>
          {loadingBody}
        </PerDiemProfileSection>
      </div>
    );
  }

  if (rateQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('hr.messages.employeePerDiemRatesLoadFailed')}
      />
    );
  }

  const row = rateQuery.data;
  const hasAnyRate = PER_DIEM_DESTINATION_CATEGORIES.some((category) => {
    if (!row) {
      return false;
    }
    return toNumber(row[PER_DIEM_CATEGORY_FIELDS[category].rate]) != null;
  });

  const usdRate = ratesQuery.data?.USD;
  const cnyRate = ratesQuery.data?.CNY;
  const rateHint =
    usdRate != null && cnyRate != null
      ? t('hr.messages.currencyRatesHint', {
          usd: usdRate.toFixed(4),
          cny: cnyRate.toFixed(4),
        })
      : null;

  const headerAction = editable ? (
    <Button
      type="primary"
      size="small"
      loading={saveMutation.isPending}
      onClick={() => form.submit()}
    >
      {t('common.save')}
    </Button>
  ) : (
    <span className="erp-users-id-chip">{row?.currency ?? 'ETB'}</span>
  );

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      className="erp-per-diem-form"
      onFinish={(values) => void handleSave(values)}
    >
      <p className="erp-per-diem-desc">
        {t('hr.section.employeePerDiemRatesDescription')}
      </p>

      {editable ? (
        <div className="erp-per-diem-toolbar">
          <Form.Item
            name="currency"
            label={t('hr.form.currency')}
            className="mb-0"
            rules={[{ required: true }]}
            extra={rateHint}
          >
            <Select
              className="erp-per-diem-currency-select"
              loading={ratesQuery.isLoading}
              disabled={ratesQuery.isLoading || ratesQuery.isError}
              options={[
                { value: 'ETB', label: 'ETB' },
                { value: 'USD', label: 'USD' },
                { value: 'CNY', label: 'CNY' },
              ]}
              onChange={(value: SupportedCurrency) => {
                convertRatesToCurrency(value);
              }}
            />
          </Form.Item>
        </div>
      ) : null}

      {editable && ratesQuery.isError ? (
        <Alert
          type="warning"
          showIcon
          title={t('hr.messages.currencyRatesUnavailable')}
        />
      ) : null}

      {!hasAnyRate && !editable ? (
        <div className="erp-per-diem-empty">
          <div className="erp-per-diem-empty-icon" aria-hidden>
            <Wallet size={22} strokeWidth={1.6} />
          </div>
          <p className="erp-per-diem-empty-title">
            {t('hr.empty.employeePerDiemRates')}
          </p>
        </div>
      ) : (
        <div className="erp-per-diem-rate-grid">
          {PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
            const { rate, active, labelKey } =
              PER_DIEM_CATEGORY_FIELDS[category];
            return (
              <PerDiemRateCard
                key={category}
                category={category}
                label={t(labelKey)}
                rateField={rate}
                activeField={active}
                accent={CATEGORY_ACCENT[category]}
                currency={currency}
                editable={editable}
                rateValue={row ? toNumber(row[rate]) : null}
                activeValue={row ? row[active] : true}
                form={form}
                dailyRateLabel={t('hr.form.dailyRate')}
                activeLabel={t('common.active')}
                inactiveLabel={t('common.inactive')}
              />
            );
          })}
        </div>
      )}
    </Form>
  );

  if (embedded) {
    return <div className="erp-per-diem-profile">{formContent}</div>;
  }

  return (
    <div className="erp-per-diem-profile">
      <PerDiemProfileSection
        title={t('hr.section.employeePerDiemRates')}
        action={headerAction}
      >
        {formContent}
      </PerDiemProfileSection>
    </div>
  );
}
