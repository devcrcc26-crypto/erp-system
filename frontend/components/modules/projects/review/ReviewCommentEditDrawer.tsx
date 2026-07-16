// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo } from 'react';
import { Button, Drawer, Form, Input, Select } from 'antd';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { CommentSeverity, ReviewModeComment } from '@/lib/api/epc.types';
import { useUpdateReviewComment } from '@/lib/query/review-comments';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { standardDetailDrawerProps } from '@/lib/theme/layout';

interface EditCommentFormValues {
  engineeringDocumentVersionId: string;
  body: string;
  severity: CommentSeverity;
}

export default function ReviewCommentEditDrawer({
  open,
  comment,
  edvOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  comment: ReviewModeComment | null;
  edvOptions: readonly { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<EditCommentFormValues>();
  const updateComment = useUpdateReviewComment();
  const messageApi = useAppMessage();

  useEffect(() => {
    if (!open || !comment) {
      return;
    }
    form.setFieldsValue({
      engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
      body: comment.body,
      severity: comment.severity as CommentSeverity,
    });
  }, [comment, form, open]);

  const documentContext = useMemo((): string | null => {
    if (!comment) {
      return null;
    }
    if (comment.commentedOn) {
      return `${comment.commentedOn.documentTitle} · Rev ${comment.commentedOn.revisionLabel}`;
    }
    const option = edvOptions.find(
      (item) => item.value === comment.engineeringDocumentVersionId,
    );
    return option?.label ?? null;
  }, [comment, edvOptions]);

  const drawerTitle = documentContext
    ? `Edit comment - ${documentContext}`
    : 'Edit comment';

  async function handleSubmit(values: EditCommentFormValues): Promise<void> {
    if (!comment) {
      return;
    }
    try {
      await updateComment.mutateAsync({
        commentId: comment.id,
        body: {
          engineeringDocumentVersionId: values.engineeringDocumentVersionId,
          body: values.body.trim(),
          severity: values.severity,
          assignedToUserId: comment.assignedToUserId,
        },
      });
      messageApi.success('Comment updated');
      onClose();
      onSaved();
    } catch (error) {
      notifyApiError(error, 'Failed to update comment', messageApi);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      title={drawerTitle}
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={updateComment.isPending}
            onClick={() => form.submit()}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <Form<EditCommentFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values: EditCommentFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          name="engineeringDocumentVersionId"
          label="Document version"
          rules={[{ required: true }]}
        >
          <Select options={[...edvOptions]} placeholder="Select document" />
        </Form.Item>
        {comment?.attachment && (
          <Form.Item label="Attached file">
            <div className="flex items-center gap-2">
              <span className="text-sm">{comment.attachment.name}</span>
              <EdvFileActions
                documentVersionId={comment.attachment.documentVersionId}
                fileName={comment.attachment.name}
              />
            </div>
          </Form.Item>
        )}
        <Form.Item name="body" label="Comment" rules={[{ required: true }]}>
          <Input.TextArea rows={4} />
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
        <Form.Item label="Assigned to">
          <span className="text-sm text-slate-700">
            {comment?.assigneeName ?? 'Not assigned'}
          </span>
        </Form.Item>
      </Form>
    </Drawer>
  );
}
