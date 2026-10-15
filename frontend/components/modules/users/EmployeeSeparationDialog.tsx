'use client';

import { useState } from 'react';
import { Alert, Checkbox, DatePicker, Form, Input, Modal, Select, Spin } from 'antd';
import type { Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { SEPARATION_TYPES, type SeparationType } from '@/lib/api/employment';
import { useSeparateEmployee, useSeparationPreview } from '@/lib/query/employment';

interface FormValues {
  leavingDate: Dayjs;
  separationType: SeparationType;
  reason: string;
}

/** HR dialog: separate an employee (leaving date = last working day). */
export default function EmployeeSeparationDialog({
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
  const [form] = Form.useForm<FormValues>();
  const [leavingDate, setLeavingDate] = useState<string | null>(null);
  const [confirmLocked, setConfirmLocked] = useState(false);
  const previewQuery = useSeparationPreview(userId, open ? leavingDate : null);
  const separate = useSeparateEmployee(userId);
  const preview = previewQuery.data;
  const lockedRuns = preview?.lockedPayrollRuns ?? [];
  const needsLockedConfirm = lockedRuns.length > 0;

  function close(): void {
    form.resetFields();
    setLeavingDate(null);
    setConfirmLocked(false);
    onClose();
  }

  async function submit(): Promise<void> {
    const values = await form.validateFields();
    try {
      await separate.mutateAsync({
        leavingDate: values.leavingDate.format('YYYY-MM-DD'),
        separationType: values.separationType,
        reason: values.reason.trim(),
        confirmLockedPayroll: needsLockedConfirm ? confirmLocked : undefined,
      });
      messageApi.success(t('users.separation.saved', { name: employeeName }));
      close();
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError ? error.message : t('users.separation.saveError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.separation.title', { name: employeeName })}
      okText={t('users.separation.confirm')}
      okButtonProps={{
        danger: true,
        disabled: needsLockedConfirm && !confirmLocked,
      }}
      confirmLoading={separate.isPending}
      onOk={() => void submit()}
      onCancel={close}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="leavingDate"
          label={t('users.separation.leavingDate')}
          extra={t('users.separation.leavingDateHint')}
          rules={[{ required: true, message: t('users.separation.leavingDateRequired') }]}
        >
          <DatePicker
            className="w-full"
            onChange={(value) => {
              setConfirmLocked(false);
              setLeavingDate(value ? value.format('YYYY-MM-DD') : null);
            }}
          />
        </Form.Item>
        <Form.Item
          name="separationType"
          label={t('users.separation.type')}
          rules={[{ required: true, message: t('users.separation.typeRequired') }]}
        >
          <Select
            options={SEPARATION_TYPES.map((type) => ({
              value: type,
              label: t(`users.separation.types.${type}`),
            }))}
          />
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

      {leavingDate && previewQuery.isLoading ? <Spin size="small" /> : null}

      {preview ? (
        <div className="flex flex-col gap-2">
          <Alert
            type="info"
            showIcon
            title={
              preview.effectiveImmediately
                ? t('users.separation.effectiveNow')
                : t('users.separation.effectiveLater', { date: preview.leavingDate })
            }
            description={
              preview.activeContract
                ? t('users.separation.contractEffect', {
                    contract: preview.activeContract.contractNumber,
                    date: preview.leavingDate,
                  })
                : t('users.separation.noActiveContract')
            }
          />
          {preview.pendingApprovalTiers.count > 0 ? (
            <Alert
              type="warning"
              showIcon
              title={t('users.separation.pendingApprovals', {
                count: preview.pendingApprovalTiers.count,
              })}
              description={
                <ul className="m-0 pl-4">
                  {preview.pendingApprovalTiers.items.map((item) => (
                    <li key={`${item.requestId}-${item.tierLabel}`}>
                      {item.requestNumber} · {item.title} ({item.tierLabel})
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}
          {preview.pendingSubmittedRequests.count > 0 ? (
            <Alert
              type="warning"
              showIcon
              title={t('users.separation.pendingSubmitted', {
                count: preview.pendingSubmittedRequests.count,
              })}
              description={
                <ul className="m-0 pl-4">
                  {preview.pendingSubmittedRequests.items.map((item) => (
                    <li key={item.requestId}>
                      {item.requestNumber} · {item.title}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}
          {needsLockedConfirm ? (
            <Alert
              type="error"
              showIcon
              title={t('users.separation.lockedPayroll', {
                runs: lockedRuns.map((r) => r.runNumber).join(', '),
              })}
              description={
                <Checkbox
                  checked={confirmLocked}
                  onChange={(event) => setConfirmLocked(event.target.checked)}
                >
                  {t('users.separation.lockedPayrollConfirm')}
                </Checkbox>
              }
            />
          ) : null}
          <p className="m-0 text-xs text-[var(--erp-text-secondary,#4B5563)]">
            {t('users.separation.finalSettlementNote')}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
