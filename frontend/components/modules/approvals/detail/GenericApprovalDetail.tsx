'use client';

import { Empty, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { DocumentPreview } from '@/components/shared/preview';
import type { ApprovalRequestDetail } from '@/lib/api/approvals.types';
import { useDocumentMetadata } from '@/lib/query/documents';
import {
  formatFormDataValue,
  formatApprovalUserName,
  getFormFieldLabels,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { isUuidLike } from '@/lib/utils/user-display';

/** formData keys that hold user ids, with the label to show instead of the raw key. */
const USER_ID_FIELD_LABEL_KEYS: Record<string, string> = {
  employeeId: 'hr.table.employee',
  submittedBy: 'hr.table.submittedBy',
};

/** File attached to an approval comment, previewable in place. */
function CommentAttachment({
  documentId,
}: {
  documentId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const metadataQuery = useDocumentMetadata(documentId);

  if (metadataQuery.isLoading) {
    return <Skeleton.Input active size="small" className="mt-2" />;
  }

  return (
    <div className="mt-2 max-w-xs">
      <DocumentPreview
        documentId={documentId}
        fileName={
          metadataQuery.data?.name ?? t('pages.approvals.resubmit.attachment')
        }
        fileType={metadataQuery.data?.fileType}
        fileSizeBytes={metadataQuery.data?.fileSizeBytes}
      />
    </div>
  );
}

/**
 * Generic approval body - form data + comments.
 */
export default function GenericApprovalDetail({
  request,
}: {
  request: ApprovalRequestDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const lookupUserName = useUserNameLookup();
  const fieldLabels = getFormFieldLabels(request.category?.formSchema);
  const formEntries = Object.entries(request.formData ?? {})
    .filter(([key]) => !key.startsWith('_'))
    .flatMap(([key, value]) => {
      const userLabelKey = USER_ID_FIELD_LABEL_KEYS[key];
      if (userLabelKey && typeof value === 'string') {
        return [
          {
            key,
            label: fieldLabels.get(key) ?? t(userLabelKey),
            value: lookupUserName(value),
          },
        ];
      }
      // Other raw ids (e.g. departmentId) mean nothing to a reader - omit them.
      if (typeof value === 'string' && isUuidLike(value)) {
        return [];
      }
      return [
        {
          key,
          label: fieldLabels.get(key) ?? key,
          value: formatFormDataValue(value, t),
        },
      ];
    });

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
                {comment.attachmentId ? (
                  <CommentAttachment documentId={comment.attachmentId} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
