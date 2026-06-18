'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DecisionTraceView from '@/components/modules/projects/review/DecisionTraceView';
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
        description="Decision trace and version history for this document."
      >
        <div className={layout.sectionStack}>
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
