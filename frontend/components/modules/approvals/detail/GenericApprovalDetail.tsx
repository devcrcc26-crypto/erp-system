'use client';

import { Descriptions, Empty, Typography } from 'antd';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
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
    <div className="flex flex-col gap-4">
      <SectionCard
        title={t('pages.approvals.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        {formEntries.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('pages.approvals.noFormData')}
          />
        ) : (
          <Descriptions bordered size="small" column={1}>
            {formEntries.map((entry) => (
              <Descriptions.Item key={entry.key} label={entry.label}>
                {entry.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </SectionCard>

      <SectionCard
        title={t('pages.approvals.comments')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
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
                className="rounded-none border border-[rgba(0,0,0,0.08)] bg-[var(--color-surface-secondary)] p-3"
              >
                <div className="mb-1 flex justify-between gap-2">
                  <Typography.Text strong>
                    {formatApprovalUserName(comment.commenter)}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatProjectDate(comment.createdAt)}
                  </Typography.Text>
                </div>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {comment.commentText}
                </Typography.Paragraph>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
