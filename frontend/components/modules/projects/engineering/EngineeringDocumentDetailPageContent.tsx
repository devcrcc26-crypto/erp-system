'use client';

import { useSearchParams } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DecisionTraceView from '@/components/modules/projects/review/DecisionTraceView';
import DraftRevisionUploadPanel from '@/components/modules/projects/engineering/DraftRevisionUploadPanel';
import TriggerRevisionPanel from '@/components/modules/projects/engineering/TriggerRevisionPanel';
import VersionHistoryTimeline from '@/components/modules/projects/engineering/VersionHistoryTimeline';
import { layout } from '@/lib/theme/layout';

export default function EngineeringDocumentDetailPageContent({
  projectId,
  engineeringDocumentId,
}: {
  projectId: string;
  engineeringDocumentId: string;
}): React.ReactNode {
  const searchParams = useSearchParams();
  const taskDisciplineId = searchParams.get('taskDisciplineId') ?? undefined;

  return (
    <div className={layout.pageStack}>
      <FormLayout
        title="Engineering Document"
        description="External revisions add a new version on this document - not a new document row. Check version history after triggering."
      >
        <div className={layout.sectionStack}>
          <TriggerRevisionPanel
            projectId={projectId}
            engineeringDocumentId={engineeringDocumentId}
          />

          <DraftRevisionUploadPanel
            projectId={projectId}
            engineeringDocumentId={engineeringDocumentId}
            taskDisciplineId={taskDisciplineId}
          />

          <DecisionTraceView
            projectId={projectId}
            engineeringDocumentId={engineeringDocumentId}
          />

          <VersionHistoryTimeline engineeringDocumentId={engineeringDocumentId} />
        </div>
      </FormLayout>
    </div>
  );
}
