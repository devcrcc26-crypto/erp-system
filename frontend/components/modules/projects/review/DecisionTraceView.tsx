'use client';

import { Spin, Timeline } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useDecisionTrace } from '@/lib/query/engineering-documents';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function DecisionTraceView({
  projectId,
  engineeringDocumentId,
  title = 'Decision trace',
}: {
  projectId: string;
  engineeringDocumentId: string;
  title?: string;
}): React.ReactNode {
  const traceQuery = useDecisionTrace(projectId, engineeringDocumentId);
  const resolveUserDisplay = useUserDisplayResolver();

  if (traceQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  const trace = traceQuery.data;

  return (
    <FormLayout
      title={title}
      description={
        trace
          ? `${trace.documentNumber ?? '-'} - ${trace.title}`
          : 'Approval lineage from workflow events'
      }
    >
      <Timeline
        items={(trace?.entries ?? []).map((entry) => ({
          key: entry.id,
          content: (
            <div className="text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium">{entry.action}</span>
                <StatusBadge label={entry.phase} variant="default" />
                <StatusBadge label={entry.loop} variant="info" />
                <span className="text-xs text-slate-500">{entry.entityType}</span>
                {entry.revisionLabel && (
                  <span className="text-xs text-slate-500">
                    Rev {entry.revisionLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {formatProjectDate(entry.createdAt)} -{' '}
                {resolveUserDisplay(entry.actorId, entry.actorName)}
              </p>
              {entry.reason && (
                <p className="mt-1 text-slate-600">{entry.reason}</p>
              )}
            </div>
          ),
        }))}
      />
    </FormLayout>
  );
}
