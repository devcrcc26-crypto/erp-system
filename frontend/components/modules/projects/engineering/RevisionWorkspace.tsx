'use client';

import { Drawer, Form, Input, Button, message } from 'antd';
import type { MyCommentItem } from '@/lib/api/epc.types';
import { useTransitionReviewComment } from '@/lib/query/review-comments';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function RevisionWorkspace({
  open,
  comment,
  onClose,
  onResolved,
}: {
  open: boolean;
  comment: MyCommentItem | null;
  onClose: () => void;
  onResolved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<{ resolutionNote: string }>();
  const transitionComment = useTransitionReviewComment();

  async function handleResolve(values: { resolutionNote: string }): Promise<void> {
    if (!comment) {
      return;
    }
    if (comment.status !== 'IN_PROGRESS') {
      message.warning('Acknowledge and start the comment before marking it resolved.');
      return;
    }

    try {
      await transitionComment.mutateAsync({
        commentId: comment.commentId,
        body: { targetStatus: 'RESOLVED' },
      });

      message.success(
        values.resolutionNote.trim()
          ? 'Comment resolved — upload revision from the engineering document panel.'
          : 'Comment marked resolved',
      );
      form.resetFields();
      onResolved();
    } catch (error) {
      notifyApiError(error);
    }
  }

  return (
    <Drawer
      title="Revision workspace"
      open={open}
      size={480}
      onClose={onClose}
      footer={
        <Button
          type="primary"
          loading={transitionComment.isPending}
          onClick={() => form.submit()}
        >
          Mark resolved
        </Button>
      }
    >
      {comment && (
        <>
          <p className="mb-2 text-sm text-slate-600">{comment.body}</p>
          <p className="mb-4 text-xs text-slate-500">
            EDV: <code>{comment.engineeringDocumentVersionId}</code>
          </p>
          <Form
            form={form}
            layout="vertical"
            onFinish={(values: { resolutionNote: string }) => void handleResolve(values)}
          >
            <Form.Item name="resolutionNote" label="Resolution note">
              <Input.TextArea
                rows={3}
                placeholder="Describe changes made or upload location"
              />
            </Form.Item>
          </Form>
        </>
      )}
    </Drawer>
  );
}
