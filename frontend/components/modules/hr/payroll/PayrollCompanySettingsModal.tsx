'use client';

import { useEffect } from 'react';
import { Alert, Button, Drawer, Form, Input, Spin } from 'antd';
import {
  BankOutlined,
  CheckCircleFilled,
  EnvironmentOutlined,
  FileProtectOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PayrollCompanySettings } from '@/lib/api/payroll.types';
import {
  usePayrollCompanySettings,
  useUpdatePayrollCompanySettings,
} from '@/lib/query/payroll';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type SettingsField = keyof PayrollCompanySettings;

const TAX_FIELDS: SettingsField[] = ['orgNameTax', 'tin', 'taxAccountNo', 'taxCollectorOffice'];
const ADDRESS_FIELDS: SettingsField[] = [
  'region',
  'zone',
  'woreda',
  'kebele',
  'houseNo',
  'phone',
  'fax',
];
const BANK_FIELDS: SettingsField[] = [
  'salaryBankName',
  'bankBranch',
  'companyAccountNumber',
  'bankLetterRefPrefix',
];

function countFilled(
  values: Partial<PayrollCompanySettings> | undefined,
  fields: SettingsField[],
): number {
  return fields.filter((field) => {
    const value = values?.[field];
    return typeof value === 'string' ? value.trim() !== '' : value != null;
  }).length;
}

interface PayrollCompanySettingsModalProps {
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

function SettingsSection({
  icon,
  title,
  description,
  filled,
  total,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  filled: number;
  total: number;
  children: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const complete = filled >= total;
  return (
    <section className="erp-payroll-settings-section">
      <header className="erp-payroll-settings-section-header">
        <span className="erp-payroll-settings-section-icon" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="erp-payroll-settings-section-title">{title}</h3>
          <p className="erp-payroll-settings-section-desc">{description}</p>
        </div>
        <span
          className={`erp-payroll-settings-progress${complete ? ' erp-payroll-settings-progress--complete' : ''}`}
        >
          {complete ? <CheckCircleFilled aria-hidden /> : null}
          {complete
            ? t('hr.payroll.companySettings.complete')
            : t('hr.payroll.companySettings.filledCount', { filled, total })}
        </span>
      </header>
      <div className="erp-payroll-settings-section-body">{children}</div>
    </section>
  );
}

/**
 * HR/admin editor for payroll tax-form letterhead and bank-letter company fields.
 */
export default function PayrollCompanySettingsModal({
  open,
  onClose,
  readOnly = false,
}: PayrollCompanySettingsModalProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<PayrollCompanySettings>();
  const settingsQuery = usePayrollCompanySettings(open);
  const updateMutation = useUpdatePayrollCompanySettings();
  const watched = Form.useWatch([], form) as Partial<PayrollCompanySettings> | undefined;
  const values = watched ?? settingsQuery.data;

  useEffect(() => {
    if (settingsQuery.data) {
      form.setFieldsValue(settingsQuery.data);
    }
  }, [form, settingsQuery.data]);

  async function handleSave(): Promise<void> {
    if (readOnly) {
      onClose();
      return;
    }
    try {
      const values = await form.validateFields();
      await updateMutation.mutateAsync(values);
      messageApi.success(t('hr.payroll.companySettings.saveSuccess'));
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      } else {
        notifyApiError(error, 'Request failed', messageApi);
      }
    }
  }

  return (
    <Drawer
      title={
        <div className="erp-payroll-settings-head">
          <span className="erp-payroll-settings-head-icon" aria-hidden>
            <SettingOutlined />
          </span>
          <div className="min-w-0">
            <p className="erp-payroll-settings-head-title">
              {t('hr.payroll.companySettings.title')}
            </p>
            <p className="erp-payroll-settings-head-desc">
              {t('hr.payroll.companySettings.description')}
            </p>
          </div>
        </div>
      }
      open={open}
      onClose={onClose}
      size={560}
      destroyOnHidden
      rootClassName="erp-payroll-settings-drawer"
      styles={{ body: { padding: 0 } }}
      footer={
        <div className="erp-payroll-settings-footer">
          {!readOnly ? (
            <Button onClick={onClose}>{t('common.cancel')}</Button>
          ) : null}
          <Button
            type="primary"
            loading={updateMutation.isPending}
            onClick={() => void handleSave()}
          >
            {readOnly
              ? t('common.close')
              : t('hr.payroll.companySettings.save')}
          </Button>
        </div>
      }
    >
      <div className="erp-payroll-settings-content">
        {readOnly ? (
          <Alert
            type="info"
            showIcon
            className="erp-payroll-settings-readonly"
            title={t('hr.payroll.companySettings.readOnly')}
          />
        ) : null}

        {settingsQuery.isLoading && !settingsQuery.data ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : settingsQuery.isError ? (
          <div>
            <Alert
              type="error"
              showIcon
              title={
                settingsQuery.error instanceof ApiRequestError
                  ? settingsQuery.error.message
                  : t('hr.payroll.companySettings.loadError')
              }
            />
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            disabled={readOnly}
            requiredMark={false}
            className="erp-payroll-settings-form"
          >
            <SettingsSection
              icon={<FileProtectOutlined />}
              title={t('hr.payroll.companySettings.sectionTax')}
              description={t('hr.payroll.companySettings.sectionTaxDesc')}
              filled={countFilled(values, TAX_FIELDS)}
              total={TAX_FIELDS.length}
            >
              <Form.Item
                name="orgNameTax"
                label={t('hr.payroll.companySettings.orgNameTax')}
                className="erp-payroll-settings-span-2"
              >
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 3 }}
                  maxLength={200}
                />
              </Form.Item>
              <Form.Item
                name="tin"
                label={t('hr.payroll.companySettings.tin')}
              >
                <Input maxLength={20} autoComplete="off" className="erp-payroll-settings-mono" />
              </Form.Item>
              <Form.Item
                name="taxAccountNo"
                label={t('hr.payroll.companySettings.taxAccountNo')}
              >
                <Input autoComplete="off" className="erp-payroll-settings-mono" />
              </Form.Item>
              <Form.Item
                name="taxCollectorOffice"
                label={t('hr.payroll.companySettings.taxCollectorOffice')}
                className="erp-payroll-settings-span-2"
              >
                <Input autoComplete="off" />
              </Form.Item>
            </SettingsSection>

            <SettingsSection
              icon={<EnvironmentOutlined />}
              title={t('hr.payroll.companySettings.sectionAddress')}
              description={t('hr.payroll.companySettings.sectionAddressDesc')}
              filled={countFilled(values, ADDRESS_FIELDS)}
              total={ADDRESS_FIELDS.length}
            >
              <Form.Item
                name="region"
                label={t('hr.payroll.companySettings.region')}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="zone" label={t('hr.payroll.companySettings.zone')}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="woreda"
                label={t('hr.payroll.companySettings.woreda')}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="kebele"
                label={t('hr.payroll.companySettings.kebele')}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="houseNo"
                label={t('hr.payroll.companySettings.houseNo')}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="phone"
                label={t('hr.payroll.companySettings.phone')}
              >
                <Input autoComplete="tel" />
              </Form.Item>
              <Form.Item
                name="fax"
                label={t('hr.payroll.companySettings.fax')}
                className="erp-payroll-settings-span-2"
              >
                <Input autoComplete="off" />
              </Form.Item>
            </SettingsSection>

            <SettingsSection
              icon={<BankOutlined />}
              title={t('hr.payroll.companySettings.sectionBank')}
              description={t('hr.payroll.companySettings.sectionBankDesc')}
              filled={countFilled(values, BANK_FIELDS)}
              total={BANK_FIELDS.length}
            >
              <Form.Item
                name="salaryBankName"
                label={t('hr.payroll.companySettings.salaryBankName')}
                className="erp-payroll-settings-span-2"
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="bankBranch"
                label={t('hr.payroll.companySettings.bankBranch')}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="companyAccountNumber"
                label={t('hr.payroll.companySettings.companyAccountNumber')}
              >
                <Input autoComplete="off" className="erp-payroll-settings-mono" />
              </Form.Item>
              <Form.Item
                name="bankLetterRefPrefix"
                label={t('hr.payroll.companySettings.bankLetterRefPrefix')}
                extra={t('hr.payroll.companySettings.bankLetterRefPrefixHint')}
                className="erp-payroll-settings-span-2"
              >
                <Input
                  maxLength={32}
                  autoComplete="off"
                  placeholder="CRIECC-FZY"
                  className="erp-payroll-settings-mono"
                />
              </Form.Item>
            </SettingsSection>
          </Form>
        )}
      </div>
    </Drawer>
  );
}
