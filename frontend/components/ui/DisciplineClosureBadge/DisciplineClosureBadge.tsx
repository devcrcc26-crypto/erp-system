'use client';

import { Tag } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { tokens } from '@/lib/theme/tokens';

export default function DisciplineClosureBadge({
  isClosed,
}: {
  isClosed: boolean;
}): React.ReactNode {
  if (isClosed) {
    return (
      <Tag
        variant="filled"
        style={{
          margin: 0,
          borderRadius: 20,
          color: tokens.colorTeal600,
          backgroundColor: tokens.colorTeal50,
          fontWeight: 500,
          fontSize: 11,
          lineHeight: '1.4',
          padding: '3px 10px',
        }}
      >
        Closed
      </Tag>
    );
  }
  return <StatusBadge label="Open" variant="warning" />;
}
