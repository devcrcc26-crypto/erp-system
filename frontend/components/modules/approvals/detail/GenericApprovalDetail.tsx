'use client';

import { Empty } from 'antd';
import {
  MetaItem,
  SectionCard,
} from '@/components/modules/hr/shared/hr-page-chrome';
import type { ApprovalRequestDetail } from '@/lib/api/approvals.types';
import {
  formatFormDataValue,
  formatApprovalUserName,
  getFormFieldLabels,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Generic approval body — form data + comments.
 */
export default function GenericApprovalDetail({
  request,
}: {
  request: ApprovalRequestDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const fieldLabels = getFormFieldLabels(request.category?.formSchema);
  const formEntries = Object.entries(request.formData ?? {})
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => ({
      key,
      label: fieldLabels.get(key) ?? key,
      value: formatFormDataValue(value, t),
    }));

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title={t('pages.approvals.requestDetails')}>
        {formEntries.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('pages.approvals.noFormData')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {formEntries.map((entry) => (
              <MetaItem key={entry.key} label={entry.label}>
                <span className="break-words">{entry.value}</span>
              </MetaItem>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('pages.approvals.comments')}>
        {(request.comments ?? []).length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('pages.approvals.noComments')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(request.comments ?? []).map((comment) => (
              <div
                key={comment.id}
                className="rounded-xl border border-[#e8ebef] bg-[#f8fafc] p-3"
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="erp-users-cell-strong text-sm">
                    {formatApprovalUserName(comment.commenter)}
                  </span>
                  <span className="erp-users-cell-sub text-xs">
                    {formatProjectDate(comment.createdAt)}
                  </span>
                </div>
                <p className="m-0 text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {comment.commentText}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
