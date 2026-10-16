'use client';

import { Alert, DatePicker, Form, Input, Modal, Typography } from 'antd';
import dayjs from 'dayjs';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import { useAuthStore } from '@/stores/auth.store';
import { formatUserName } from '@/lib/utils/user-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  useRecordSiteApproval,
  useRecordConsultantApproval,
} from '@/lib/query/epc-submittals';

interface ApprovalFormValues {
  approvedAt?: dayjs.Dayjs | null;
  notes?: string;
}

interface ExternalApprovalModalProps {
  open: boolean;
  mode: 'SITE' | 'CONSULTANT';
  /** Name of the external party on whose behalf the approval is recorded. */
  onBehalfOf: string;
  projectId: string;
  submittalId: string;
  attachmentFolderId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExternalApprovalModal({
  open,
  mode,
  onBehalfOf,
  projectId,
  submittalId,
  attachmentFolderId,
  onClose,
  onSuccess,
}: ExternalApprovalModalProps): React.ReactNode {
  const [form] = Form.useForm<ApprovalFormValues>();
  const messageApi = useAppMessage();
  const user = useAuthStore((state) => state.user);
  const recordedByName = user ? formatUserName(user) : '';

  const recordSiteApproval = useRecordSiteApproval();
  const recordConsultantApproval = useRecordConsultantApproval();

  const isPending =
    recordSiteApproval.isPending || recordConsultantApproval.isPending;

  const title =
    mode === 'SITE'
      ? 'Record Site Approval'
      : 'Record Consultant Approval';

  async function handleSubmit(values: ApprovalFormValues): Promise<void> {
    const body = {
      approvedAt: values.approvedAt
        ? values.approvedAt.toISOString()
        : undefined,
      notes: values.notes?.trim() || undefined,
    };

    try {
      if (mode === 'SITE') {
        await recordSiteApproval.mutateAsync({ projectId, submittalId, body });
      } else {
        await recordConsultantApproval.mutateAsync({
          projectId,
          submittalId,
          body,
        });
      }
      messageApi.success(`${mode === 'SITE' ? 'Site' : 'Consultant'} approval recorded`);
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to record approval', messageApi);
    }
  }

  function handleCancel(): void {
    form.resetFields();
    onClose();
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      okText="Record Approval"
      confirmLoading={isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values: ApprovalFormValues) => void handleSubmit(values)}
      >
        <Form.Item label="Recorded by">
          <Typography.Text>{recordedByName || '-'}</Typography.Text>
        </Form.Item>

        <Form.Item label="On behalf of">
          <Typography.Text>{onBehalfOf || '-'}</Typography.Text>
        </Form.Item>

        <Form.Item label="Approval date" name="approvedAt">
          <DatePicker className="w-full" />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea
            rows={3}
            placeholder="Optional notes or conditions"
          />
        </Form.Item>

        {attachmentFolderId ? (
          <Form.Item label="Evidence documents">
            <DocumentAttachmentPanel
              folderId={attachmentFolderId}
              readOnly={false}
              title=""
              description="Upload signed approval letters or supporting evidence"
            />
          </Form.Item>
        ) : (
          <Alert
            type="info"
            showIcon
            className="!mb-2"
            message="Upload evidence documents in the attachments section after saving."
          />
        )}
      </Form>
    </Modal>
  );
}
