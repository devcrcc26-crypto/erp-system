'use client';

import { useEffect, useMemo } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  type InputNumberProps,
} from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  EmployeeContractDetail,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  contractTypeRequiresEndDate,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';

export interface EmployeeContractFormValues {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt: dayjs.Dayjs;
  startDate: dayjs.Dayjs;
  endDate?: dayjs.Dayjs | null;
  notes?: string;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  probationEndDate?: dayjs.Dayjs | null;
  governedBy?: string;
}

interface EmployeeContractFormProps {
  mode?: 'create' | 'edit';
  contract?: EmployeeContractDetail;
  isSubmitting?: boolean;
  submitLabel: string;
  onSubmit: (values: EmployeeContractFormValues) => void | Promise<void>;
  formId?: string;
  showFooterActions?: boolean;
}

function CurrencyInputNumber({
  value,
  onChange,
  currencySuffix = 'ETB',
  ...rest
}: InputNumberProps & { currencySuffix?: string }): React.ReactNode {
  return (
    <Space.Compact className="w-full">
      <Input
        disabled
        value={currencySuffix}
        style={{ width: 64, textAlign: 'center' }}
      />
      <InputNumber
        {...rest}
        value={value}
        onChange={onChange}
        className="w-full"
        style={{ width: '100%' }}
      />
    </Space.Compact>
  );
}

function valuesFromContract(
  contract: EmployeeContractDetail,
): EmployeeContractFormValues {
  return {
    employeeId: contract.employeeId,
    contractType: contract.contractType,
    signedAt: dayjs(contract.signedAt),
    startDate: dayjs(contract.startDate),
    endDate: contract.endDate ? dayjs(contract.endDate) : undefined,
    notes: contract.notes ?? undefined,
    basicSalary: contract.basicSalary ? Number(contract.basicSalary) : undefined,
    transportationAllowance: contract.transportationAllowance
      ? Number(contract.transportationAllowance)
      : undefined,
    monthlyBonus: contract.monthlyBonus
      ? Number(contract.monthlyBonus)
      : undefined,
    netSalary: contract.netSalary ? Number(contract.netSalary) : undefined,
    probationEndDate: contract.probationEndDate
      ? dayjs(contract.probationEndDate)
      : undefined,
    governedBy: contract.governedBy ?? undefined,
  };
}

function defaultValues(): Partial<EmployeeContractFormValues> {
  return { contractType: 'FIXED_TERM' };
}

export default function EmployeeContractForm({
  mode = 'create',
  contract,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  formId = 'employee-contract-form',
  showFooterActions = false,
}: EmployeeContractFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<EmployeeContractFormValues>();
  const contractType =
    Form.useWatch('contractType', form) ?? contract?.contractType ?? 'FIXED_TERM';
  const basicSalary = Form.useWatch('basicSalary', form);
  const transportationAllowance = Form.useWatch('transportationAllowance', form);
  const monthlyBonus = Form.useWatch('monthlyBonus', form);
  const requiresEndDate = contractTypeRequiresEndDate(contractType);

  const typeOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractType(option.value, t),
      })),
    [t],
  );

  useEffect(() => {
    form.setFieldsValue(
      contract ? valuesFromContract(contract) : defaultValues(),
    );
  }, [contract, form]);

  async function handleFinish(
    values: EmployeeContractFormValues,
  ): Promise<void> {
    await onSubmit(values);
  }

  return (
    <Form<EmployeeContractFormValues>
      id={formId}
      form={form}
      layout="vertical"
      className="flex min-h-0 flex-1 flex-col gap-4"
      initialValues={defaultValues()}
      onFinish={(values) => void handleFinish(values)}
    >
      <FormLayout variant="pro" dense title={t('hr.section.contractDetails')}>
        <div className="erp-form-grid-2">
          <Form.Item
            name="employeeId"
            label={t('hr.form.employee')}
            rules={[
              { required: true, message: t('hr.validation.selectEmployee') },
            ]}
          >
            <UserSelect
              placeholder={t('hr.placeholder.employee')}
              allowClear={false}
              disabled={mode === 'edit'}
            />
          </Form.Item>
          <Form.Item
            name="contractType"
            label={t('hr.form.contractType')}
            rules={[{ required: true, message: t('hr.validation.required') }]}
          >
            <Select
              options={typeOptions}
              onChange={(value: EmployeeContractType) => {
                if (value === 'OPEN_ENDED') {
                  form.setFieldValue('endDate', undefined);
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="signedAt"
            label={t('hr.form.signedAt')}
            rules={[
              { required: true, message: t('hr.validation.selectDate') },
            ]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="startDate"
            label={t('hr.form.startDate')}
            rules={[
              { required: true, message: t('hr.validation.selectDate') },
            ]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          {requiresEndDate ? (
            <Form.Item
              name="endDate"
              label={t('hr.form.endDate')}
              rules={[
                { required: true, message: t('hr.validation.endDateRequired') },
              ]}
            >
              <DatePicker className="w-full" />
            </Form.Item>
          ) : null}
          <Form.Item name="basicSalary" label={t('hr.labels.basicSalary')}>
            <CurrencyInputNumber
              min={0}
              precision={2}
              currencySuffix={t('hr.currency.ETB')}
            />
          </Form.Item>
          <Form.Item
            name="transportationAllowance"
            label={t('hr.labels.transportationAllowance')}
          >
            <CurrencyInputNumber
              min={0}
              precision={2}
              currencySuffix={t('hr.currency.ETB')}
            />
          </Form.Item>
          <Form.Item name="monthlyBonus" label={t('hr.labels.monthlyBonus')}>
            <CurrencyInputNumber
              min={0}
              precision={2}
              currencySuffix={t('hr.currency.ETB')}
            />
          </Form.Item>
          <Form.Item name="netSalary" label={t('hr.labels.netSalary')}>
            <CurrencyInputNumber
              min={0}
              precision={2}
              currencySuffix={t('hr.currency.ETB')}
              placeholder={
                basicSalary != null &&
                transportationAllowance != null &&
                monthlyBonus != null
                  ? String(basicSalary + transportationAllowance + monthlyBonus)
                  : undefined
              }
            />
          </Form.Item>
          <Form.Item
            name="probationEndDate"
            label={t('hr.labels.probationEndDate')}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="governedBy" label={t('hr.labels.governedBy')}>
            <Input placeholder={t('hr.placeholder.governedBy')} />
          </Form.Item>
          <Form.Item
            name="notes"
            label={t('hr.form.notes')}
            className="md:col-span-2"
          >
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </div>
      </FormLayout>

      {showFooterActions ? (
        <div className="flex justify-end">
          <Button
            type="primary"
            htmlType="submit"
            loading={isSubmitting}
            style={{ borderRadius: 0 }}
          >
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </Form>
  );
}
