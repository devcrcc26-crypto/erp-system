'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  EmployeeContractDetail,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import {
  useCreateEmployeeContract,
  useUpdateEmployeeContract,
} from '@/lib/query/employee-contract';
import {
  EMPLOYEE_CONTRACT_TYPE_OPTIONS,
  contractTypeRequiresEndDate,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
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
  onSuccess: (result: EmployeeContractDetail) => void;
}

export default function EmployeeContractForm({
  mode = 'create',
  contract,
  onSuccess,
}: EmployeeContractFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const contractType = Form.useWatch('contractType', form) ?? contract?.contractType ?? 'FIXED_TERM';
  const basicSalary = Form.useWatch('basicSalary', form);
  const transportationAllowance = Form.useWatch('transportationAllowance', form);
  const monthlyBonus = Form.useWatch('monthlyBonus', form);
  const requiresEndDate = contractTypeRequiresEndDate(contractType);

  const createMutation = useCreateEmployeeContract();
  const updateMutation = useUpdateEmployeeContract(contract?.id ?? '');

  const typeOptions = useMemo(
    () =>
      EMPLOYEE_CONTRACT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: formatEmployeeContractType(option.value, t),
      })),
    [t],
  );

  async function handleSubmit(): Promise<void> {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (values.startDate.isBefore(values.signedAt, 'day')) {
      messageApi.error(t('hr.validation.startAfterSigned'));
      return;
    }

    if (requiresEndDate && !values.endDate) {
      messageApi.error(t('hr.validation.endDateRequired'));
      return;
    }

    if (
      requiresEndDate &&
      values.endDate &&
      values.endDate.isBefore(values.startDate, 'day')
    ) {
      messageApi.error(t('hr.validation.endAfterStart'));
      return;
    }

    setSubmitting(true);
    try {
      const endDate = requiresEndDate
        ? values.endDate?.format('YYYY-MM-DD')
        : undefined;

      const salaryPayload = {
        basicSalary: values.basicSalary,
        transportationAllowance: values.transportationAllowance,
        monthlyBonus: values.monthlyBonus,
        netSalary:
          values.netSalary ??
          (values.basicSalary != null &&
          values.transportationAllowance != null &&
          values.monthlyBonus != null
            ? values.basicSalary +
              values.transportationAllowance +
              values.monthlyBonus
            : undefined),
        probationEndDate: values.probationEndDate?.format('YYYY-MM-DD'),
        governedBy: values.governedBy?.trim() || undefined,
      };

      const result =
        mode === 'edit'
          ? await updateMutation.mutateAsync({
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate: requiresEndDate ? endDate : null,
              notes: values.notes?.trim() || undefined,
              ...salaryPayload,
            })
          : await createMutation.mutateAsync({
              employeeId: values.employeeId,
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate,
              notes: values.notes?.trim() || undefined,
              ...salaryPayload,
            });

      messageApi.success(
        mode === 'edit'
          ? t('hr.messages.employeeContractUpdated')
          : t('hr.messages.employeeContractCreated'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      notifyApiError(
        error,
        mode === 'edit'
          ? t('hr.messages.failedToUpdateEmployeeContract')
          : t('hr.messages.failedToCreateEmployeeContract'),
        messageApi,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
      <SectionCard
        title={t('hr.section.contractDetails')}
        bodyClassName="px-5 py-4"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={
            contract
              ? {
                  employeeId: contract.employeeId,
                  contractType: contract.contractType,
                  signedAt: dayjs(contract.signedAt),
                  startDate: dayjs(contract.startDate),
                  endDate: contract.endDate ? dayjs(contract.endDate) : undefined,
                  notes: contract.notes ?? undefined,
                  basicSalary: contract.basicSalary
                    ? Number(contract.basicSalary)
                    : undefined,
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
                }
              : { contractType: 'FIXED_TERM' }
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="signedAt"
              label={t('hr.form.signedAt')}
              rules={[
                { required: true, message: t('hr.validation.selectDate') },
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="startDate"
              label={t('hr.form.startDate')}
              rules={[
                { required: true, message: t('hr.validation.selectDate') },
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {requiresEndDate ? (
            <Form.Item
              name="endDate"
              label={t('hr.form.endDate')}
              rules={[
                { required: true, message: t('hr.validation.endDateRequired') },
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item name="basicSalary" label={t('hr.labels.basicSalary')}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                addonAfter="ETB"
              />
            </Form.Item>
            <Form.Item
              name="transportationAllowance"
              label={t('hr.labels.transportationAllowance')}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                addonAfter="ETB"
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item name="monthlyBonus" label={t('hr.labels.monthlyBonus')}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                addonAfter="ETB"
              />
            </Form.Item>
            <Form.Item name="netSalary" label={t('hr.labels.netSalary')}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                addonAfter="ETB"
                placeholder={
                  basicSalary != null &&
                  transportationAllowance != null &&
                  monthlyBonus != null
                    ? String(basicSalary + transportationAllowance + monthlyBonus)
                    : undefined
                }
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="probationEndDate"
              label={t('hr.labels.probationEndDate')}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="governedBy" label={t('hr.labels.governedBy')}>
              <Input placeholder="Ethiopian Labor Proclamation 1156/2019" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label={t('hr.form.notes')}>
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="primary"
          loading={submitting}
          onClick={() => void handleSubmit()}
        >
          {mode === 'edit'
            ? t('hr.buttons.save')
            : t('hr.buttons.createContract')}
        </Button>
      </div>
    </div>
  );
}
