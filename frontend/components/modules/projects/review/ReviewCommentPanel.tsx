'use client';

import { Button, Form, Input, Select, Space, message } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import type { CommentSeverity, ReviewModeView } from '@/lib/api/epc.types';
import { useAddReviewComment } from '@/lib/query/review-comments';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';

interface CommentFormValues {
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
  assignedToUserId: string;
}

export default function ReviewCommentPanel({
  reviewMode,
  onCommentAdded,
}: {
  reviewMode: ReviewModeView | null | undefined;
  onCommentAdded: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<CommentFormValues>();
  const addComment = useAddReviewComment();

  const edvOptions = (reviewMode?.snapshotEdvIds ?? []).map((id) => ({
    value: id,
    label: id.slice(0, 8) + '…',
  }));

  async function handleSubmit(values: CommentFormValues): Promise<void> {
    if (!reviewMode?.reviewSessionId) {
      message.error('No active review session');
      return;
    }

    await addComment.mutateAsync({
      reviewSessionId: reviewMode.reviewSessionId,
      engineeringDocumentVersionId: values.engineeringDocumentVersionId,
      body: values.body.trim(),
      severity: values.severity,
      assignedToUserId: values.assignedToUserId,
    });

    message.success('Comment added');
    form.resetFields();
    onCommentAdded();
  }

  return (
    <FormLayout title="Add comment" description="Severity drives review routing.">
      <Form<CommentFormValues>
        form={form}
        layout="vertical"
        initialValues={{ severity: 'MODERATE' as CommentSeverity }}
        onFinish={(values: CommentFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          name="engineeringDocumentVersionId"
          label="Document version"
          rules={[{ required: true }]}
        >
          <Select options={edvOptions} placeholder="Select EDV from snapshot" />
        </Form.Item>
        <Form.Item name="body" label="Comment" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'MINOR', label: 'Minor' },
              { value: 'MODERATE', label: 'Moderate' },
              { value: 'MAJOR', label: 'Major' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="assignedToUserId"
          label="Assign to designer"
          rules={[{ required: true }]}
        >
          <UserSelect />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={addComment.isPending}>
          Add comment
        </Button>
      </Form>

      <div className="mt-6 space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Session comments</h4>
        {(reviewMode?.comments ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No comments yet.</p>
        ) : (
          reviewMode?.comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded border border-slate-200 bg-white p-3 text-sm"
            >
              <div className="mb-1 flex items-center gap-2">
                <CommentSeverityTag severity={comment.severity} />
                <span className="text-xs text-slate-500">{comment.status}</span>
              </div>
              <p>{comment.body}</p>
            </div>
          ))
        )}
      </div>
    </FormLayout>
  );
}
