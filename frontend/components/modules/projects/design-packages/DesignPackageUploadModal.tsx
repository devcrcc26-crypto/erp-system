'use client';

import { useState } from 'react';
import { Alert, Button, Form, Modal, Space, Spin, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';
import { UploadOutlined } from '@ant-design/icons';
import EdvMetadataForm, {
  buildMetadataFromForm,
  type EdvMetadataFormValues,
} from '@/components/modules/projects/engineering/EdvMetadataForm';
import type { EngineeringDocumentType } from '@/lib/api/epc.types';
import { apiGet } from '@/lib/api/client';
import { ApiRequestError, toApiRequestError } from '@/lib/api/errors';
import { useAddDesignPackageItem } from '@/lib/query/design-packages';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import {
  useDisciplineUploadFolder,
  useRegisterEngineeringDocument,
} from '@/lib/query/engineering-documents';
import { getLatestEngineeringDocumentVersion } from '@/lib/utils/engineering-document-versions';
import { layout } from '@/lib/theme/layout';

type UploadStep = 'idle' | 'uploading' | 'registering' | 'attaching';

interface DocumentWithVersions {
  id: string;
  currentVersionId?: string;
  versions?: { id: string; versionNumber: number }[];
}

async function resolveCoreDocumentVersionId(
  uploaded: DocumentWithVersions,
): Promise<string | null> {
  if (uploaded.currentVersionId) {
    return uploaded.currentVersionId;
  }
  const document = await apiGet<DocumentWithVersions>(
    `/documents/${uploaded.id}`,
  );
  return document.versions?.[0]?.id ?? null;
}

function stepLabel(step: UploadStep): string {
  switch (step) {
    case 'uploading':
      return 'Uploading...';
    case 'registering':
      return 'Registering...';
    case 'attaching':
      return 'Attaching...';
    default:
      return 'Upload and attach';
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return error.message || fallback;
  }
  return toApiRequestError(error).message || fallback;
}

export default function DesignPackageUploadModal({
  open,
  onClose,
  projectId,
  taskDisciplineId,
  packageId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  onSuccess: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<EdvMetadataFormValues>();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep>('idle');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const folderQuery = useDisciplineUploadFolder(
    projectId,
    taskDisciplineId,
    open,
  );
  const uploadDocument = useUploadDocumentToFolder();
  const registerDocument = useRegisterEngineeringDocument();
  const addItem = useAddDesignPackageItem();

  const folderId = folderQuery.data?.id;
  const folderPath = folderQuery.data?.path;
  const folderReady = Boolean(folderId);
  const busy = step !== 'idle';
  const documentType = Form.useWatch('documentType', form) as
    | EngineeringDocumentType
    | undefined;

  function resetFormState(): void {
    setPendingFile(null);
    setStep('idle');
    setInlineError(null);
    form.resetFields();
  }

  function handleClose(): void {
    if (busy) {
      return;
    }
    resetFormState();
    onClose();
  }

  async function handleSubmit(values: EdvMetadataFormValues): Promise<void> {
    setInlineError(null);

    if (!pendingFile) {
      setInlineError('Select a file to upload.');
      return;
    }

    let resolvedFolderId = folderId;
    if (!resolvedFolderId) {
      const refetched = await folderQuery.refetch();
      resolvedFolderId = refetched.data?.id;
    }
    if (!resolvedFolderId) {
      setInlineError(
        'Document folder could not be prepared for upload. Try again.',
      );
      return;
    }

    const documentNumber = values.documentNumber?.trim();
    if (!documentNumber) {
      setInlineError(
        'Document number is required to register an engineering document.',
      );
      return;
    }

    let uploadSucceeded = false;
    let registerSucceeded = false;
    let coreDocumentVersionId: string | null = null;

    try {
      setStep('uploading');
      const uploaded = await uploadDocument.mutateAsync({
        folderId: resolvedFolderId,
        file: pendingFile,
      });
      uploadSucceeded = true;

      coreDocumentVersionId = await resolveCoreDocumentVersionId(uploaded);
      if (!coreDocumentVersionId) {
        setInlineError(
          'Upload succeeded but the file version was not found. The file is in Document Control - register and attach manually, or retry.',
        );
        setStep('idle');
        return;
      }

      setStep('registering');
      const registered = await registerDocument.mutateAsync({
        projectId,
        taskDisciplineId,
        body: {
          documentVersionId: coreDocumentVersionId,
          documentType: values.documentType,
          title: values.title.trim(),
          documentNumber,
          metadata: buildMetadataFromForm(values.documentType, values),
        },
      });
      registerSucceeded = true;

      const edvId =
        registered.versions?.find((v) => v.revisionLabel === '0')?.id ??
        getLatestEngineeringDocumentVersion(registered.versions)?.id;

      if (!edvId) {
        setInlineError(
          'Upload and registration succeeded, but the new EDV id was missing from the response. Attach the document to this subtask manually from Add EDV.',
        );
        setStep('idle');
        return;
      }

      setStep('attaching');
      await addItem.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
        body: { engineeringDocumentVersionId: edvId },
      });

      resetFormState();
      onSuccess();
      onClose();
    } catch (error) {
      if (!uploadSucceeded) {
        setInlineError(
          errorMessage(error, 'Upload failed. No file was stored.'),
        );
      } else if (!registerSucceeded) {
        setInlineError(
          `Uploading succeeded but registration failed: ${errorMessage(error, 'unknown error')}. The file is in Document Control - fix the error and retry register/attach, or clean up the orphaned upload.`,
        );
      } else {
        setInlineError(
          `Upload and registration succeeded, but attaching to the subtask failed: ${errorMessage(error, 'unknown error')}. Use Add EDV to attach the registered document.`,
        );
      }
      setStep('idle');
    }
  }

  return (
    <Modal
      title="Upload document"
      open={open}
      onCancel={handleClose}
      destroyOnHidden
      style={{ top: 20 }}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 160px)',
          overflowY: 'auto',
        },
      }}
      footer={
        <Space>
          <Button onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={busy || folderQuery.isFetching}
            disabled={!folderReady && folderQuery.isLoading}
            onClick={() => form.submit()}
          >
            {stepLabel(step)}
          </Button>
        </Space>
      }
    >
      <div className={layout.drawerStack}>
        {inlineError && (
          <Alert type="error" showIcon title={inlineError} />
        )}

        {folderQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spin size="small" />
            Preparing upload folder...
          </div>
        )}

        {folderQuery.isError && (
          <Alert
            type="error"
            showIcon
            title="Could not resolve the discipline upload folder."
          />
        )}

        {folderPath && (
          <p className={layout.drawerMutedText}>
            Files upload to:{' '}
            <span className="font-mono">{folderPath}</span>
          </p>
        )}

        <Upload
          beforeUpload={(file: RcFile) => {
            setPendingFile(file);
            setInlineError(null);
            return false;
          }}
          maxCount={1}
          disabled={busy}
          onRemove={() => setPendingFile(null)}
          fileList={
            pendingFile
              ? [
                  {
                    uid: 'pending-package-upload',
                    name: pendingFile.name,
                    status: 'done',
                  },
                ]
              : []
          }
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.dwg"
        >
          <Button icon={<UploadOutlined />} disabled={busy}>
            Select file
          </Button>
        </Upload>

        <Form<EdvMetadataFormValues>
          form={form}
          layout="vertical"
          disabled={busy}
          initialValues={{ documentType: 'DRAWING' as EngineeringDocumentType }}
          onFinish={(values) => void handleSubmit(values)}
        >
          <EdvMetadataForm documentType={documentType ?? 'DRAWING'} />
        </Form>
      </div>
    </Modal>
  );
}
