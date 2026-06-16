'use client';

import { Alert } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';

/**
 * Project documents tab ? wires to Core Foundation document folders when available.
 * Project-specific folder resolution will come from the backend project module.
 */
export default function ProjectDocumentsPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        title="Project document folders"
        description="When the backend exposes a document folder for this project, files will appear here. Until then, use company-level document management from Settings."
      />

      <FormLayout
        title="Project files"
        description={`Document repository for project ${projectId}.`}
      >
        <DocumentAttachmentPanel
          folderId={undefined}
          readOnly
          title="Project documents"
          description="Upload drawings, contracts, and site photos once the project folder is provisioned."
        />
      </FormLayout>
    </div>
  );
}
