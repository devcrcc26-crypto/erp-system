'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import type { VersionHistoryEntry } from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import {
  useDecisionTrace,
  useDisciplineUploadFolder,
  useReplaceDraftVersionFile,
} from '@/lib/query/engineering-documents';
import { useEngineeringDocumentVersionHistory } from '@/lib/query/epc-workspace';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { layout } from '@/lib/theme/layout';

interface DocumentWithVersions {
  id: string;
  versions?: { id: string; versionNumber: number }[];
}

async function resolveLatestDocumentVersionId(
  documentId: string,
): Promise<string> {
  const document = await apiGet<DocumentWithVersions>(`/documents/${documentId}`);
  const version = document.versions?.[0];
  if (!version?.id) {
    throw new Error('Uploaded file version not found');
  }
  return version.id;
}

function findExternalDraftRevision(
  entries: readonly VersionHistoryEntry[],
): VersionHistoryEntry | undefined {
  return entries.find(
    (entry) =>
      entry.status === 'DRAFT' &&
      (entry.loop === 'EXTERNAL' ||
        entry.events.some((event) => event.action === 'TRIGGER_REVISION')),
  );
}

/**
 * Uploads the revised file onto an active draft EDV created by external revision trigger.
 */
export default function DraftRevisionUploadPanel({
  projectId,
  engineeringDocumentId,
  taskDisciplineId,
}: {
  projectId: string;
  engineeringDocumentId: string;
  taskDisciplineId?: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const historyQuery = useEngineeringDocumentVersionHistory(
    engineeringDocumentId,
    !permLoading && lens.canViewEngineering,
  );
  const decisionTraceQuery = useDecisionTrace(projectId, engineeringDocumentId);
  const replaceDraftFile = useReplaceDraftVersionFile();
  const uploadDocument = useUploadDocumentToFolder();

  const resolvedDisciplineId =
    taskDisciplineId ?? decisionTraceQuery.data?.taskDisciplineId;

  const uploadFolderQuery = useDisciplineUploadFolder(
    projectId,
    resolvedDisciplineId ?? '',
    !permLoading && Boolean(resolvedDisciplineId) && lens.canEditEngineering,
  );

  const draftRevision = useMemo(
    () => findExternalDraftRevision(historyQuery.data ?? []),
    [historyQuery.data],
  );

  async function handleUpload(): Promise<void> {
    if (!draftRevision) {
      return;
    }
    if (!pendingFile) {
      messageApi.error('Select a file to upload');
      return;
    }
    if (!resolvedDisciplineId) {
      messageApi.error('Discipline context is missing - open this document from the discipline page.');
      return;
    }

    try {
      let folderId = uploadFolderQuery.data?.id;
      if (!folderId) {
        const folder = await uploadFolderQuery.refetch();
        folderId = folder.data?.id;
      }
      if (!folderId) {
        messageApi.error('Document folder could not be prepared for upload');
        return;
      }

      const uploaded = await uploadDocument.mutateAsync({
        folderId,
        file: pendingFile,
      });
      const documentVersionId = await resolveLatestDocumentVersionId(uploaded.id);

      await replaceDraftFile.mutateAsync({
        projectId,
        engineeringDocumentId,
        versionId: draftRevision.engineeringDocumentVersionId,
        body: { documentVersionId },
      });

      messageApi.success('Revised file attached to the draft revision.');
      setPendingFile(null);
      void historyQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to upload revised file', messageApi);
    }
  }

  if (permLoading || historyQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering || !draftRevision) {
    return null;
  }

  const isUploading =
    uploadDocument.isPending || replaceDraftFile.isPending || uploadFolderQuery.isFetching;

  return (
    <FormLayout
      title="Upload revised file"
      description="Attach the updated drawing or document to the draft revision created by the external trigger."
      className="erp-draft-revision-upload-panel"
      extra={
        lens.canEditEngineering ? (
          <Button
            type="primary"
            onClick={() => void handleUpload()}
            disabled={!pendingFile || !resolvedDisciplineId}
            loading={isUploading}
          >
            Attach file
          </Button>
        ) : undefined
      }
    >
      <Alert
        type="info"
        showIcon
        className="!mb-3"
        title="Draft revision ready"
        description={
          <>
            Rev {draftRevision.revisionLabel}{' '}
            <EdvStatusBadge status={draftRevision.status} /> - upload your revised
            file here, then continue the internal review workflow to lock it.
          </>
        }
      />

      {!resolvedDisciplineId && (
        <Alert
          type="warning"
          showIcon
          className="!mb-3"
          title="Discipline context missing"
          description="Open this document from the discipline engineering list so uploads can be stored in the correct folder."
        />
      )}

      {lens.canEditEngineering && (
        <Upload
          beforeUpload={(file: RcFile) => {
            setPendingFile(file);
            return false;
          }}
          maxCount={1}
          onRemove={() => setPendingFile(null)}
          fileList={
            pendingFile
              ? [
                  {
                    uid: 'pending-draft-revision',
                    name: pendingFile.name,
                    status: 'done',
                  },
                ]
              : []
          }
        >
          <Button icon={<UploadOutlined />}>Select revised file</Button>
        </Upload>
      )}

      {!lens.canEditEngineering && (
        <p className={layout.drawerMutedText}>
          You can view the draft revision in version history below.
        </p>
      )}
    </FormLayout>
  );
}
