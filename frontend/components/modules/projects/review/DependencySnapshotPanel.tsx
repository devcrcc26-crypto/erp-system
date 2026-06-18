'use client';

import { Alert, List } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { ReviewModeView } from '@/lib/api/epc.types';

export default function DependencySnapshotPanel({
  reviewMode,
}: {
  reviewMode: ReviewModeView | null | undefined;
}): React.ReactNode {
  const snapshotIds = reviewMode?.snapshotEdvIds ?? [];

  return (
    <FormLayout
      title="Dependency snapshot"
      description="Frozen cross-discipline references at session open."
    >
      {reviewMode?.contentHash && (
        <p className="mb-3 text-xs text-slate-500">
          Content hash: <code className="text-slate-700">{reviewMode.contentHash}</code>
        </p>
      )}

      {snapshotIds.length === 0 ? (
        <Alert type="info" showIcon title="No snapshot EDVs" />
      ) : (
        <List
          size="small"
          bordered
          dataSource={[...snapshotIds]}
          renderItem={(edvId) => (
            <List.Item>
              <span className="font-mono text-xs">{edvId}</span>
            </List.Item>
          )}
        />
      )}
    </FormLayout>
  );
}
