'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DecisionTraceView from '@/components/modules/projects/review/DecisionTraceView';
import VersionHistoryTimeline from '@/components/modules/projects/engineering/VersionHistoryTimeline';

export default function EngineeringDocumentDetailPageContent({
  projectId,
  engineeringDocumentId,
}: {
  projectId: string;
  engineeringDocumentId: string;
}): React.ReactNode {
  return (
    <div className="space-y-6">
      <FormLayout
        title="Engineering Document"
        description="Decision trace and version history for this document."
      >
        <div className="space-y-6">
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
