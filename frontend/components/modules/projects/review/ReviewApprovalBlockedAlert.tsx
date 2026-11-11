'use client';

import { Alert } from 'antd';
import type { ReviewModeComment } from '@/lib/api/epc.types';
import {
  APPROVAL_BLOCKED_MESSAGE,
  getCommentsBlockingApproval,
} from '@/lib/utils/comment-workflow';

export default function ReviewApprovalBlockedAlert({
  comments,
}: {
  comments: readonly ReviewModeComment[];
}): React.ReactNode {
  const blocking = getCommentsBlockingApproval(comments);
  if (blocking.length === 0) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      title="Approval blocked"
      description={
        <div className="space-y-2">
          <p>{APPROVAL_BLOCKED_MESSAGE}</p>
          <ul className="list-disc pl-5 text-sm">
            {blocking.map((comment) => (
              <li key={comment.id}>
                <span className="font-medium">{comment.status}</span>
                {' - '}
                {comment.body}
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
