'use client';

import { useState } from 'react';
import { Button, Input, List } from 'antd';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useAddApprovalComment,
  useApprovalRequest,
} from '@/lib/query/approvals';
import { formatApprovalUserName } from '@/lib/utils/approval-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * Employee comment box after OT was approved with changes.
 */
export default function OvertimeApproverAdjustmentComment({
  approvalRequestId,
}: {
  approvalRequestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const detailQuery = useApprovalRequest(approvalRequestId);
  const addComment = useAddApprovalComment(approvalRequestId);
  const [text, setText] = useState('');

  const comments = detailQuery.data?.comments ?? [];

  async function handleSubmit(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    try {
      await addComment.mutateAsync({ commentText: trimmed });
      setText('');
      messageApi.success(t('pages.hr.overtime.approverAdjustmentCommentSaved'));
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.overtime.approverAdjustmentCommentFailed'),
        messageApi,
      );
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
      <p className="m-0 mb-2 text-[13px] font-semibold text-[var(--color-text-primary)]">
        {t('pages.hr.overtime.approverAdjustmentCommentsTitle')}
      </p>
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]">
        {t('pages.hr.overtime.approverAdjustmentCommentsHint')}
      </p>
      {comments.length > 0 ? (
        <List
          size="small"
          className="mb-3"
          dataSource={comments}
          renderItem={(item) => (
            <List.Item className="!px-0">
              <div className="w-full">
                <p className="m-0 text-[12px] text-[var(--color-text-secondary)]">
                  {formatApprovalUserName(item.commenter)} ·{' '}
                  {formatDisplayDateTime(item.createdAt)}
                </p>
                <p className="m-0 mt-0.5 whitespace-pre-wrap">{item.commentText}</p>
              </div>
            </List.Item>
          )}
        />
      ) : null}
      <Input.TextArea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('pages.hr.overtime.approverAdjustmentCommentPlaceholder')}
        className="!mb-2"
      />
      <Button
        type="primary"
        loading={addComment.isPending}
        disabled={text.trim().length === 0}
        onClick={() => void handleSubmit()}
      >
        {t('pages.hr.overtime.approverAdjustmentCommentSubmit')}
      </Button>
    </div>
  );
}
