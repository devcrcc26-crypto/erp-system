'use client';

import { useMemo, useState } from 'react';
import { Segmented, Spin, Timeline } from 'antd';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
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
    <FormLayout
      title="Version history"
      description="Per-EDV workflow events with internal/external loop classification."
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
  );
}

function VersionEntryBlock({ entry }: { entry: VersionHistoryEntry }): React.ReactNode {
  return (
    <div className="mb-6 rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">Rev {entry.revisionLabel}</span>
        <EdvStatusBadge status={entry.status} />
        <span className="text-xs text-slate-500">{entry.loop} loop</span>
        <span className="text-xs text-slate-500">
          {formatProjectDate(entry.createdAt)}
        </span>
      </div>
      <Timeline
        size="small"
        items={entry.events.map((event, index) => ({
          key: `${entry.engineeringDocumentVersionId}-${index}`,
          children: (
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
