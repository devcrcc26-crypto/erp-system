'use client';

import './approvals-v2.css';

import { Form, Input, Modal } from 'antd';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { useReassignApprovalTier } from '@/lib/query/approvals';
import { formatApprovalUserName } from '@/lib/utils/approval-display';

interface ReassignValues {
  newApproverId: string;
  reason: string;
}

/** HR Manager / System Administrator: move a pending tier to another active employee. */
export default function ApprovalReassignDialog({
  open,
  requestId,
  requesterId,
  tier,
  onClose,
}: {
  open: boolean;
  requestId: string;
  requesterId: string;
  tier: ApprovalTier | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<ReassignValues>();
  const reassign = useReassignApprovalTier(requestId);

  function close(): void {
    form.resetFields();
    onClose();
  }

  async function submit(): Promise<void> {
    if (!tier) return;
    const values = await form.validateFields();
    try {
      await reassign.mutateAsync({
        tierId: tier.id,
        newApproverId: values.newApproverId,
        reason: values.reason.trim(),
      });
      messageApi.success(
        t('pages.approvals.reassign.saved', { label: tier.label }),
      );
      close();
    } catch (error) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.approvals.reassign.error'),
      );
    }
  }

  return (
    <Modal
      open={open && tier != null}
      title={t('pages.approvals.reassign.title', { label: tier?.label ?? '' })}
      okText={t('pages.approvals.reassign.confirm')}
      confirmLoading={reassign.isPending}
      onOk={() => void submit()}
      onCancel={close}
      destroyOnHidden
      centered
      width={520}
      rootClassName="erp-approval-modal"
      className="erp-approval-modal"
    >
      {tier ? (
        <p className="erp-approval-modal-hint">
          {t('pages.approvals.reassign.current', {
            name: formatApprovalUserName(tier.approver),
          })}
        </p>
      ) : null}
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="newApproverId"
          label={t('pages.approvals.reassign.newApprover')}
          extra={t('pages.approvals.reassign.newApproverHint')}
          rules={[
            {
              required: true,
              message: t('pages.approvals.reassign.newApproverRequired'),
            },
          ]}
        >
          <UserSelect
            activeEmploymentOnly
            approverOnly
            excludeUserIds={[
              requesterId,
              ...(tier ? [tier.approverId] : []),
            ]}
            placeholder={t('pages.approvals.reassign.newApprover')}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label={t('pages.approvals.reassign.reason')}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t('pages.approvals.reassign.reasonRequired'),
            },
            { min: 3, message: t('pages.approvals.reassign.reasonRequired') },
            { max: 1000 },
          ]}
        >
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
