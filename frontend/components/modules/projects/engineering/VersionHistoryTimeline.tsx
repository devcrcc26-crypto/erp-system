'use client';

import { useMemo, useState } from 'react';
import { Segmented, Spin, Timeline } from 'antd';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { VersionHistoryEntry, WorkflowLoop } from '@/lib/api/epc.types';
import { useEngineeringDocumentVersionHistory } from '@/lib/query/epc-workspace';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function VersionHistoryTimeline({
  engineeringDocumentId,
}: {
  engineeringDocumentId: string;
}): React.ReactNode {
  const [loopFilter, setLoopFilter] = useState<'ALL' | WorkflowLoop>('ALL');
  const historyQuery = useEngineeringDocumentVersionHistory(engineeringDocumentId);

  const filtered = useMemo(() => {
    const entries = historyQuery.data ?? [];
    if (loopFilter === 'ALL') {
      return entries;
    }
    return entries.filter((entry) => entry.loop === loopFilter);
  }, [historyQuery.data, loopFilter]);

  if (historyQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  return (
    <div id="version-history">
      <FormLayout
        title="Version history"
        description="Each row is a revision of this document. Trigger revision adds a new draft entry here - not a new document in the discipline list."
        extra={
          <Segmented
            value={loopFilter}
            onChange={(value: string | number) =>
              setLoopFilter(value as 'ALL' | WorkflowLoop)
            }
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'INTERNAL', label: 'Internal' },
              { value: 'EXTERNAL', label: 'External' },
            ]}
          />
        }
      >
        {filtered.map((entry) => (
          <VersionEntryBlock key={entry.engineeringDocumentVersionId} entry={entry} />
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-slate-500">No version history available.</p>
        )}
      </FormLayout>
    </div>
  );
}

function VersionEntryBlock({ entry }: { entry: VersionHistoryEntry }): React.ReactNode {
  return (
    <div className="mb-6 rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Rev {entry.revisionLabel}</span>
          <EdvStatusBadge status={entry.status} />
          <span className="text-xs text-slate-500">{entry.loop} loop</span>
          <span className="text-xs text-slate-500">
            {formatProjectDate(entry.createdAt)}
          </span>
        </div>
        <EdvFileActions
          documentVersionId={entry.documentVersionId}
          fileName={entry.fileName ?? undefined}
        />
      </div>
      <div className="mb-3 text-sm text-slate-700">
        <span className="text-slate-500">File:</span>{' '}
        <span className="font-medium">{entry.fileName ?? '-'}</span>
        {entry.fileVersionNumber != null ? (
          <span className="ml-2 text-xs text-slate-500">
            (file v{entry.fileVersionNumber})
          </span>
        ) : null}
      </div>
      <Timeline
        items={entry.events.map((event, index) => ({
          key: `${entry.engineeringDocumentVersionId}-${index}`,
          content: (
            <span className="text-sm">
              <strong>{event.action}</strong>{' '}
              <span className="text-slate-500">({event.phase})</span>{' '}
              <span className="text-xs text-slate-400">
                {formatProjectDate(event.createdAt)}
              </span>
            </span>
          ),
        }))}
      />
    </div>
  );
}
