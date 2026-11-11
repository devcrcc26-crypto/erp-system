'use client';

import { useState } from 'react';
import { Alert, Form, Input, Modal, Radio } from 'antd';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  useRecordSiteFeedback,
  useRecordConsultantFeedback,
} from '@/lib/query/epc-submittals';

interface FeedbackFormValues {
  kind: 'COMMENT' | 'REJECTION';
  comment: string;
}

interface ExternalFeedbackModalProps {
  open: boolean;
  mode: 'SITE' | 'CONSULTANT';
  projectId: string;
  submittalId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExternalFeedbackModal({
  open,
  mode,
  projectId,
  submittalId,
  onClose,
  onSuccess,
}: ExternalFeedbackModalProps): React.ReactNode {
  const [form] = Form.useForm<FeedbackFormValues>();
  const messageApi = useAppMessage();
  const [kind, setKind] = useState<'COMMENT' | 'REJECTION'>('COMMENT');

  const recordSiteFeedback = useRecordSiteFeedback();
  const recordConsultantFeedback = useRecordConsultantFeedback();

  const isPending =
    recordSiteFeedback.isPending || recordConsultantFeedback.isPending;

  const title =
    mode === 'SITE'
      ? 'Record Site Feedback'
      : 'Record Consultant Feedback';

  async function handleSubmit(values: FeedbackFormValues): Promise<void> {
    const body = { kind: values.kind, comment: values.comment.trim() };

    try {
      if (mode === 'SITE') {
        await recordSiteFeedback.mutateAsync({ projectId, submittalId, body });
      } else {
        await recordConsultantFeedback.mutateAsync({
          projectId,
          submittalId,
          body,
        });
      }
      messageApi.success('Feedback recorded');
      form.resetFields();
      setKind('COMMENT');
      onSuccess();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to record feedback', messageApi);
    }
  }

  function handleCancel(): void {
    form.resetFields();
    setKind('COMMENT');
    onClose();
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      okText="Record Feedback"
      confirmLoading={isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ kind: 'COMMENT' }}
        onValuesChange={(changed) => {
          if (changed.kind === 'COMMENT' || changed.kind === 'REJECTION') {
            setKind(changed.kind);
          }
        }}
        onFinish={(values: FeedbackFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Feedback type"
          name="kind"
          rules={[{ required: true, message: 'Select a feedback type' }]}
        >
          <Radio.Group
            options={[
              { value: 'COMMENT', label: 'Comment' },
              { value: 'REJECTION', label: 'Rejection' },
            ]}
            optionType="button"
          />
        </Form.Item>

        {kind === 'REJECTION' && (
          <Alert
            type="warning"
            showIcon
            className="!mb-4"
            message="Rejection will be logged against this release. A revision may be needed."
          />
        )}

        <Form.Item
          label="Comment"
          name="comment"
          rules={[
            { required: true, message: 'Comment is required' },
            { min: 1, whitespace: true, message: 'Comment cannot be blank' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder={
              kind === 'REJECTION'
                ? 'Describe why this release was rejected'
                : 'Enter the feedback or comment received'
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
