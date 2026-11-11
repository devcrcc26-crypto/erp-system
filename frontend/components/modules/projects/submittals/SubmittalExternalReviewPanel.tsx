'use client';

import { Alert } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';

/**
 * Read-only panel for external submittal review outcomes linked to change requests.
 */
export default function SubmittalExternalReviewPanel({
  submittalId,
}: {
  submittalId: string;
}): React.ReactNode {
  return (
    <FormLayout
      title="External review"
      description="Outcomes from client/consultant review - may trigger RFIs or change requests."
    >
      <Alert
        type="info"
        showIcon
        title="External review triggers"
        description={`Submittal ${submittalId.slice(0, 8)}… - external review outcomes are processed by RevisionOrchestrator. Linked change requests appear in the project correspondence log when available.`}
      />
    </FormLayout>
  );
}
