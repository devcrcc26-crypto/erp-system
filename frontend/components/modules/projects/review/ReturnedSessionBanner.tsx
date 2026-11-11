'use client';

import { Alert } from 'antd';
import type { ReviewModeView } from '@/lib/api/epc.types';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import ReviewTierBadge from '@/components/modules/projects/review/ReviewTierBadge';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function ReturnedSessionBanner({
  session,
}: {
  session: NonNullable<ReviewModeView['lastReturnedSession']>;
}): React.ReactNode {
  return (
    <Alert
      type="warning"
      showIcon
      title="Returned for rework"
      description={
        <div className="space-y-3">
          <p>
            Returned by {reviewTierBilingualLabel(session.returnedByTier)} on{' '}
            {session.closedAt ? formatProjectDate(session.closedAt) : 'an unknown date'}
            {session.closedReason ? `: ${session.closedReason}` : ''}
          </p>
          {session.comments.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {session.comments.map((comment, index) => (
                <li key={index} className="p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <CommentSeverityTag severity={comment.severity} />
                    <ReviewTierBadge tier={comment.reviewTier} />
                  </div>
                  <p className="mb-1 text-slate-800">
                    {comment.body ?? '(File attachment)'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {comment.authorName} · {formatProjectDate(comment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
