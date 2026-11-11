'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { RehireContractType } from '@/lib/api/employment';
import { useRehireEmployee } from '@/lib/query/employment';

const CONTRACT_TYPES: RehireContractType[] = ['FIXED_TERM', 'OPEN_ENDED', 'PROBATION', 'RENEWAL'];

interface RehireValues {
  startDate: Dayjs;
  signedAt: Dayjs;
  endDate?: Dayjs | null;
  contractType: RehireContractType;
  basicSalary: number;
  transportationAllowance?: number | null;
  monthlyBonus?: number | null;
  pensionApplicable?: boolean;
  reason: string;
}

/**
 * HR dialog: rehire a separated employee (new employment period + contract).
 * The temporary password is shown once after saving.
 */
export default function EmployeeRehireDialog({
  open,
  userId,
  employeeName,
  onClose,
}: {
  open: boolean;
  userId: string;
  employeeName: string;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<RehireValues>();
  const rehire = useRehireEmployee(userId);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  function close(): void {
    form.resetFields();
    setTemporaryPassword(null);
    onClose();
  }

  async function submit(): Promise<void> {
    if (temporaryPassword) {
      close();
      return;
    }
    const values = await form.validateFields();
    try {
      const result = await rehire.mutateAsync({
        startDate: values.startDate.format('YYYY-MM-DD'),
        signedAt: values.signedAt.format('YYYY-MM-DD'),
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
        contractType: values.contractType,
        basicSalary: values.basicSalary,
        transportationAllowance: values.transportationAllowance ?? undefined,
        monthlyBonus: values.monthlyBonus ?? undefined,
        pensionApplicable: values.pensionApplicable,
        reason: values.reason.trim(),
      });
      messageApi.success(t('users.employment.rehired', { name: employeeName }));
      setTemporaryPassword(result.temporaryPassword);
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError ? error.message : t('users.employment.saveError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.employment.rehireTitle', { name: employeeName })}
      okText={temporaryPassword ? t('common.close') : t('users.employment.rehire')}
      cancelButtonProps={temporaryPassword ? { style: { display: 'none' } } : undefined}
      confirmLoading={rehire.isPending}
      onOk={() => void submit()}
      onCancel={close}
      mask={{ closable: !temporaryPassword }}
      destroyOnHidden
      rootClassName="erp-hr-travel-modal"
      className="erp-hr-travel-modal"
    >
      {temporaryPassword ? (
        <Alert
          type="success"
          showIcon
          title={t('users.employment.temporaryPasswordTitle')}
          description={
            <div className="flex flex-col gap-2">
              <Typography.Text code copyable className="text-base">
                {temporaryPassword}
              </Typography.Text>
              <span>{t('users.employment.temporaryPasswordHint')}</span>
            </div>
          }
        />
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            className="mb-4"
            title={t('users.employment.rehireHint')}
          />
          <Form
            form={form}
            layout="vertical"
            requiredMark
            initialValues={{ contractType: 'FIXED_TERM' }}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Form.Item
                name="startDate"
                label={t('users.employment.rehireStart')}
                rules={[{ required: true, message: t('users.employment.fromRequired') }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item
                name="signedAt"
                label={t('users.employment.signedAt')}
                rules={[{ required: true, message: t('users.employment.fromRequired') }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item
                name="contractType"
                label={t('users.employment.contractType')}
                rules={[{ required: true }]}
              >
                <Select
                  options={CONTRACT_TYPES.map((type) => ({
                    value: type,
                    label: t(`users.employment.contractTypes.${type}`),
                  }))}
                />
              </Form.Item>
              <Form.Item name="endDate" label={t('users.employment.contractEnd')}>
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item
                name="basicSalary"
                label={t('users.employment.basicSalary')}
                rules={[{ required: true, message: t('users.employment.basicSalaryRequired') }]}
              >
                <InputNumber className="w-full" min={0} step={100} />
              </Form.Item>
              <Form.Item name="transportationAllowance" label={t('users.employment.transport')}>
                <InputNumber className="w-full" min={0} step={100} />
              </Form.Item>
              <Form.Item name="monthlyBonus" label={t('users.employment.monthlyBonus')}>
                <InputNumber className="w-full" min={0} step={100} />
              </Form.Item>
              <Form.Item
                name="pensionApplicable"
                label={t('users.employment.pension')}
                extra={t('users.employment.pensionHint')}
              >
                <Select
                  allowClear
                  placeholder={t('users.employment.pensionDefault')}
                  options={[
                    { value: true, label: t('common.yes') },
                    { value: false, label: t('common.no') },
                  ]}
                />
              </Form.Item>
            </div>
            <Form.Item
              name="reason"
              label={t('users.separation.reason')}
              rules={[
                { required: true, whitespace: true, message: t('users.separation.reasonRequired') },
                { max: 2000 },
              ]}
            >
              <Input.TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
