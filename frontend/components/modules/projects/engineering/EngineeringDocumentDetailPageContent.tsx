'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DecisionTraceView from '@/components/modules/projects/review/DecisionTraceView';
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
  return (
    <div className={layout.pageStack}>
      <FormLayout
        title="Engineering Document"
        description="Decision trace, version history, and external revision controls."
      >
        <div className={layout.sectionStack}>
          <TriggerRevisionPanel
            projectId={projectId}
            engineeringDocumentId={engineeringDocumentId}
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
