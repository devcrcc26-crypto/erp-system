'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, Space, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

export default function ApproveReviewSessionModal({
  open,
  onClose,
  onConfirm,
  isFinalTier,
  nextTierLabel,
  isInstituteChiefProxy,
  loading,
  projectId,
  taskDisciplineId,
  instituteChiefName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (params: {
    approvedOnBehalfOfName?: string;
    attachmentDocumentVersionId?: string;
    note?: string;
  }) => Promise<void>;
  isFinalTier: boolean;
  nextTierLabel: string;
  isInstituteChiefProxy: boolean;
  loading: boolean;
  projectId: string;
  taskDisciplineId: string;
  /** Prefills the "on behalf of" name field when the external Institute Chief has no system account. */
  instituteChiefName?: string | null;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const uploadDocument = useUploadDocumentToFolder();
  const uploadFolderQuery = useDisciplineUploadFolder(projectId, taskDisciplineId);
  const [approveOnBehalf, setApproveOnBehalf] = useState(false);
  const [onBehalfOfName, setOnBehalfOfName] = useState(instituteChiefName ?? '');
  const [note, setNote] = useState('');
  const [attachmentDocumentId, setAttachmentDocumentId] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setApproveOnBehalf(false);
      setOnBehalfOfName(instituteChiefName ?? '');
      setNote('');
      setAttachmentDocumentId(null);
      setAttachmentFileName(null);
    }
  }, [open, instituteChiefName]);

  const canConfirm = !approveOnBehalf || onBehalfOfName.trim().length > 0;
  const title = isFinalTier
    ? 'Approve - close subtask'
    : `Approve & escalate to ${nextTierLabel}`;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={loading}
            disabled={!canConfirm || loading}
            onClick={() =>
              void onConfirm({
                approvedOnBehalfOfName: approveOnBehalf
                  ? onBehalfOfName.trim()
                  : undefined,
                attachmentDocumentVersionId: attachmentDocumentId ?? undefined,
                note: note.trim() || undefined,
              })
            }
          >
            Confirm
          </Button>
        </Space>
      }
    >
      <div className="space-y-4">
        {isInstituteChiefProxy && (
          <div className="space-y-2">
            <Checkbox
              checked={approveOnBehalf}
              onChange={(event) => setApproveOnBehalf(event.target.checked)}
            >
              Approve on behalf of Institute Chief
            </Checkbox>
            {approveOnBehalf && (
              <Input
                placeholder="Institute Chief's name"
                value={onBehalfOfName}
                onChange={(event) => setOnBehalfOfName(event.target.value)}
              />
            )}
          </div>
        )}
        <div>
          <p className="mb-2 text-sm text-slate-700">Optional file attachment</p>
          <Upload
            maxCount={1}
            showUploadList={false}
            disabled={!uploadFolderQuery.data?.id || uploadDocument.isPending || loading}
            beforeUpload={(file: File) => {
              const folderId = uploadFolderQuery.data?.id;
              if (!folderId) {
                messageApi.error('Upload folder is not ready');
                return Upload.LIST_IGNORE;
              }
              void uploadDocument
                .mutateAsync({ folderId, file })
                .then((record) => {
                  setAttachmentDocumentId(record.id);
                  setAttachmentFileName(file.name);
                  messageApi.success('File attached');
                })
                .catch((error: unknown) => {
                  notifyApiError(error, 'Failed to upload file', messageApi);
                });
              return false;
            }}
          >
            <Button
              icon={<UploadOutlined />}
              loading={uploadDocument.isPending}
              disabled={loading}
            >
              Attach file
            </Button>
          </Upload>
          {attachmentFileName ? (
            <p className="mt-2 text-sm text-slate-600">Attached: {attachmentFileName}</p>
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-sm text-slate-700">Note for next reviewer</p>
          <Input.TextArea
            rows={3}
            value={note}
            placeholder="Add a note for the next reviewer (optional)"
            disabled={loading}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
