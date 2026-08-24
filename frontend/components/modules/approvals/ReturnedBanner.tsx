'use client';

import { Alert, Typography } from 'antd';
import { tokens } from '@/lib/theme/tokens';

/**
 * Banner shown when an approval was returned for revision.
 */
export default function ReturnedBanner({
  note,
}: {
  note?: string | null;
}): React.ReactNode {
  return (
    <Alert
      type="warning"
      showIcon
      style={{
        marginBottom: 0,
        borderColor: tokens.colorPrimary,
        background: tokens.colorPrimaryLight,
      }}
      title="This request was returned"
      description={
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {note?.trim()
            ? `Approver note: ${note.trim()}. Please make changes and resubmit.`
            : 'Please make changes and resubmit.'}
        </Typography.Paragraph>
      }
    />
  );
}
