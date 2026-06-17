'use client';

import { Alert, Spin } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDocumentFolder } from '@/lib/query/documents';
import { layout } from '@/lib/theme/layout';

export default function ProjectDocumentsPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const foldersQuery = useProjectDocumentFolder(projectId);
  const projectFolder = foldersQuery.data?.data[0];
  const folderId = projectFolder?.id;

  if (foldersQuery.isLoading) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (foldersQuery.isError) {
    const status =
      foldersQuery.error instanceof ApiRequestError
        ? foldersQuery.error.status
        : 0;

    return (
      <Alert
        type={status === 403 ? 'warning' : 'error'}
        showIcon
        title={
          status === 403
            ? 'You do not have permission to view project documents.'
            : 'Unable to load project document folders.'
        }
        description={
          status === 403
            ? 'Ask your administrator for documents view access, or use company-level document management from Settings.'
            : foldersQuery.error instanceof ApiRequestError
              ? foldersQuery.error.message
              : undefined
        }
      />
    );
  }

  return (
    <div className={layout.pageStack}>
      {!folderId ? (
        <Alert
          type="info"
          showIcon
          title="No project document folder yet"
          description="This project does not have a document folder provisioned. Create one from Settings → Documents, or contact your administrator."
        />
      ) : (
        <FormLayout
          title={projectFolder.name}
          description={`Repository path: ${projectFolder.path}`}
        >
          <DocumentAttachmentPanel
            folderId={folderId}
            title="Project files"
            description="Contracts, drawings, site photos, and other project documentation."
          />
        </FormLayout>
      )}
    </div>
  );
}
