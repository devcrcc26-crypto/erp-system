'use client';

import { useEffect } from 'react';
import { Alert, Button, Form, InputNumber, Space, Spin, Switch } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { Wallet } from 'lucide-react';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
  type PerDiemActiveField,
  type PerDiemDestinationCategory,
  type PerDiemRateField,
} from '@/lib/constants/per-diem-destination-categories';
import {
  useEmployeePerDiemRate,
  useMyEmployeePerDiemRate,
  useUpsertEmployeePerDiemRate,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';

const ETB = 'ETB';

type FormValues = Partial<
  Record<PerDiemRateField, number | null> & Record<PerDiemActiveField, boolean>
>;

const CATEGORY_ACCENT: Record<PerDiemDestinationCategory, string> = {
  Domestic: '#1d9e75',
  Regional: '#0d9488',
  International: '#0369a1',
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
  description,
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
  description: string;
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
        <div className="min-w-0 flex-1">
          <p className="erp-per-diem-rate-label">{label}</p>
          <p className="erp-per-diem-rate-meta m-0 mt-0.5">{description}</p>
        </div>
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
          {rateValue != null ? formatEtbAmount(rateValue) : '-'}
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
  emptyMessage,
}: {
  employeeId: string;
  editable?: boolean;
  embedded?: boolean;
  /** Replaces the default "no rates" text in view-only mode. */
  emptyMessage?: string;
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

  useEffect(() => {
    if (!rateQuery.data) {
      return;
    }
    const row = rateQuery.data;
    const values: FormValues = {};
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
        domesticRate: toNumber(values.domesticRate),
        regionalRate: toNumber(values.regionalRate),
        internationalRate: toNumber(values.internationalRate),
        domesticActive: Boolean(values.domesticActive),
        regionalActive: Boolean(values.regionalActive),
        internationalActive: Boolean(values.internationalActive),
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
    <span className="erp-users-id-chip">{ETB}</span>
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

      {!hasAnyRate && !editable ? (
        <div className="erp-per-diem-empty">
          <div className="erp-per-diem-empty-icon" aria-hidden>
            <Wallet size={22} strokeWidth={1.6} />
          </div>
          <p className="erp-per-diem-empty-title">
            {emptyMessage ?? t('hr.empty.employeePerDiemRates')}
          </p>
        </div>
      ) : (
        <div className="erp-per-diem-rate-grid">
          {PER_DIEM_DESTINATION_CATEGORIES.map((category) => {
            const { rate, active, labelKey, descriptionKey } =
              PER_DIEM_CATEGORY_FIELDS[category];
            return (
              <PerDiemRateCard
                key={category}
                category={category}
                label={t(labelKey)}
                description={t(descriptionKey)}
                rateField={rate}
                activeField={active}
                accent={CATEGORY_ACCENT[category]}
                currency={ETB}
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
