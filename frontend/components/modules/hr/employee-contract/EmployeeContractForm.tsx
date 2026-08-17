'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
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

      const result =
        mode === 'edit'
          ? await updateMutation.mutateAsync({
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate: requiresEndDate ? endDate : null,
              notes: values.notes?.trim() || undefined,
            })
          : await createMutation.mutateAsync({
              employeeId: values.employeeId,
              contractType: values.contractType,
              signedAt: values.signedAt.format('YYYY-MM-DD'),
              startDate: values.startDate.format('YYYY-MM-DD'),
              endDate,
              notes: values.notes?.trim() || undefined,
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
