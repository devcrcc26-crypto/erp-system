'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { Alert, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { INACTIVE_TYPES, type EmploymentState, type InactiveType } from '@/lib/api/employment';
import { useReactivateEmployee, useSetInactive } from '@/lib/query/employment';

interface SetInactiveValues {
  type: InactiveType;
  fromDate: Dayjs;
  toDate?: Dayjs | null;
  reason: string;
}

/** HR dialog: suspension / long leave / other. Pay and login follow policy. */
export function EmployeeSetInactiveDialog({
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
  const [form] = Form.useForm<SetInactiveValues>();
  const setInactive = useSetInactive(userId);

  function close(): void {
    form.resetFields();
    onClose();
  }

  async function submit(): Promise<void> {
    const values = await form.validateFields();
    try {
      await setInactive.mutateAsync({
        type: values.type,
        fromDate: values.fromDate.format('YYYY-MM-DD'),
        toDate: values.toDate ? values.toDate.format('YYYY-MM-DD') : undefined,
        reason: values.reason.trim(),
      });
      messageApi.success(t('users.employment.inactiveSaved', { name: employeeName }));
      close();
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError ? error.message : t('users.employment.saveError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.employment.setInactiveTitle', { name: employeeName })}
      okText={t('users.employment.setInactive')}
      confirmLoading={setInactive.isPending}
      onOk={() => void submit()}
      onCancel={close}
      destroyOnHidden
      rootClassName="erp-hr-travel-modal"
      className="erp-hr-travel-modal"
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title={t('users.employment.setInactiveHint')}
      />
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="type"
          label={t('users.employment.inactiveType')}
          rules={[{ required: true, message: t('users.employment.typeRequired') }]}
        >
          <Select
            options={INACTIVE_TYPES.map((type) => ({
              value: type,
              label: t(`users.employment.inactiveTypes.${type}`),
            }))}
          />
        </Form.Item>
        <Form.Item
          name="fromDate"
          label={t('users.employment.from')}
          rules={[{ required: true, message: t('users.employment.fromRequired') }]}
        >
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item
          name="toDate"
          label={t('users.employment.toOptional')}
          extra={t('users.employment.toHint')}
          dependencies={['fromDate']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs | null | undefined) {
                const from = getFieldValue('fromDate') as Dayjs | undefined;
                if (!value || !from || !value.isBefore(from, 'day')) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(t('users.employment.toBeforeFrom')));
              },
            }),
          ]}
        >
          <DatePicker className="w-full" />
        </Form.Item>
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
    </Modal>
  );
}

/** HR dialog: end the current (or cancel the upcoming) inactive period. */
export function EmployeeReactivateDialog({
  open,
  userId,
  employeeName,
  inactive,
  onClose,
}: {
  open: boolean;
  userId: string;
  employeeName: string;
  inactive: NonNullable<EmploymentState['inactive']>;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<{ lastInactiveDate?: Dayjs | null }>();
  const reactivate = useReactivateEmployee(userId);

  function close(): void {
    form.resetFields();
    onClose();
  }

  async function submit(): Promise<void> {
    const values = await form.validateFields();
    try {
      await reactivate.mutateAsync(
        values.lastInactiveDate ? values.lastInactiveDate.format('YYYY-MM-DD') : undefined,
      );
      messageApi.success(t('users.employment.reactivated', { name: employeeName }));
      close();
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError ? error.message : t('users.employment.saveError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.employment.reactivateTitle', { name: employeeName })}
      okText={t('users.employment.reactivate')}
      confirmLoading={reactivate.isPending}
      onOk={() => void submit()}
      onCancel={close}
      destroyOnHidden
      rootClassName="erp-hr-travel-modal"
      className="erp-hr-travel-modal"
    >
      <p className="mt-0">
        {inactive.current
          ? t('users.employment.reactivateCurrent', {
              type: t(`users.employment.inactiveTypes.${inactive.type}`),
              from: inactive.fromDate,
            })
          : t('users.employment.reactivateUpcoming', { from: inactive.fromDate })}
      </p>
      {inactive.current ? (
        <Form form={form} layout="vertical">
          <Form.Item
            name="lastInactiveDate"
            label={t('users.employment.lastInactiveDate')}
            extra={t('users.employment.lastInactiveDateHint')}
          >
            <DatePicker className="w-full" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
}
