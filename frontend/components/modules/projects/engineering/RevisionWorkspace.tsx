'use client';

import { Drawer, Form, Input, Button } from 'antd';
import type { MyCommentItem } from '@/lib/api/epc.types';
import { useTransitionReviewComment } from '@/lib/query/review-comments';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { antDrawerBodyStyles, layout } from '@/lib/theme/layout';

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
  const messageApi = useAppMessage();

  async function handleResolve(values: { resolutionNote: string }): Promise<void> {
    if (!comment) {
      return;
    }
    if (comment.status !== 'IN_PROGRESS') {
      messageApi.warning('Acknowledge and start the comment before marking it resolved.');
      return;
    }

    try {
      await transitionComment.mutateAsync({
        commentId: comment.commentId,
        body: { targetStatus: 'RESOLVED' },
      });

      messageApi.success(
        values.resolutionNote.trim()
          ? 'Comment resolved — upload revision from the engineering document panel.'
          : 'Comment marked resolved',
      );
      form.resetFields();
      onResolved();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  return (
    <Drawer
      title="Revision workspace"
      open={open}
      size={480}
      onClose={onClose}
      styles={antDrawerBodyStyles}
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
        <div className={layout.drawerStack}>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">{comment.body}</p>
            <p className="text-xs text-slate-500">
              EDV: <code>{comment.engineeringDocumentVersionId}</code>
            </p>
          </div>
          <Form
            form={form}
            layout="vertical"
            className="erp-drawer-form"
            onFinish={(values: { resolutionNote: string }) => void handleResolve(values)}
          >
            <Form.Item name="resolutionNote" label="Resolution note">
              <Input.TextArea
                rows={4}
                placeholder="Describe changes made or upload location"
              />
            </Form.Item>
          </Form>
        </div>
      )}
    </Drawer>
  );
}
