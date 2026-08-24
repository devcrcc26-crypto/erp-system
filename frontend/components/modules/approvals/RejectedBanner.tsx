'use client';

import { Alert, Typography } from 'antd';

/**
 * Read-only rejection banner — no actions.
 */
export default function RejectedBanner({
  note,
}: {
  note?: string | null;
}): React.ReactNode {
  return (
    <Alert
      type="error"
      showIcon
      style={{ marginBottom: 0 }}
      title="This request was rejected"
      description={
        note?.trim() ? (
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {note.trim()}
          </Typography.Paragraph>
        ) : undefined
      }
    />
  );
}
