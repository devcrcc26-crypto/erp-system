'use client';

import { Descriptions, Empty, Typography } from 'antd';
import type { ApprovalRequestDetail } from '@/lib/api/approvals.types';
import {
  formatFormDataValue,
  formatApprovalUserName,
  getFormFieldLabels,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Generic approval body — form data + comments (extracted from Approvals detail).
 */
export default function GenericApprovalDetail({
  request,
}: {
  request: ApprovalRequestDetail;
}): React.ReactNode {
  const fieldLabels = getFormFieldLabels(request.category?.formSchema);
  const formEntries = Object.entries(request.formData ?? {})
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => ({
      key,
      label: fieldLabels.get(key) ?? key,
      value: formatFormDataValue(value),
    }));

  return (
    <div
      style={{
        background: tokens.colorCardBg,
        border: `1px solid ${tokens.colorBorder}`,
        borderRadius: 8,
        padding: 24,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Request details
      </Typography.Title>
      {formEntries.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No form data"
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

      <Typography.Title level={5} style={{ marginTop: 28 }}>
        Comments
      </Typography.Title>
      {(request.comments ?? []).length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No comments yet"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(request.comments ?? []).map((comment) => (
            <div
              key={comment.id}
              style={{
                border: `1px solid ${tokens.colorBorder}`,
                borderRadius: 8,
                padding: 12,
                background: tokens.colorSurfaceSecondary,
              }}
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
    </div>
  );
}
