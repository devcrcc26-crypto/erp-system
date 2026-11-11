'use client';

import { useState } from 'react';
import { Input } from 'antd';
import { RotateCcw } from 'lucide-react';
import { DocumentPreviewGroup } from '@/components/shared/preview';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalResponse } from '@/lib/api/approvals.types';
import { useResubmitApprovalRequest } from '@/lib/query/approvals';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatApprovalUserName } from '@/lib/utils/approval-display';

import './approvals-v2.css';

/**
 * The single Resubmit action for a RETURNED request (requester only), opened
 * from the request page. Edits are saved separately on the edit form; this
 * sends the request back to the same tier that returned it (earlier
 * approvals stay) with an optional note.
 */
export default function ResubmitRequestDialog({
  requestId,
  open,
  onClose,
}: {
  requestId: string;
  open: boolean;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const resubmitMutation = useResubmitApprovalRequest(requestId);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  function close(): void {
    setNote('');
    setFiles([]);
    onClose();
  }

  async function handleConfirm(): Promise<void> {
    try {
      await resubmitMutation.mutateAsync({
        note: note.trim() || undefined,
        files,
      });
      messageApi.success(t('pages.approvals.resubmit.success'));
      close();
    } catch (error: unknown) {
      notifyApiError(error, t('pages.approvals.resubmit.failed'), messageApi);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      className="erp-approval-modal"
      tone="warning"
      icon={<RotateCcw size={18} strokeWidth={2} aria-hidden />}
      title={t('pages.approvals.resubmit.modalTitle')}
      description={t('pages.approvals.resubmit.modalDescription')}
      confirmLabel={t('pages.approvals.resubmit.submit')}
      cancelLabel={t('hr.buttons.cancel')}
      confirmLoading={resubmitMutation.isPending}
      onCancel={close}
      onConfirm={() => void handleConfirm()}
    >
      <div className="erp-confirm-dialog-field">
        <p className="erp-confirm-dialog-field-label">
          {t('pages.approvals.resubmit.noteLabel')}
        </p>
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 8 }}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          showCount
          placeholder={t('pages.approvals.resubmit.notePlaceholder')}
        />
      </div>
      <div className="erp-confirm-dialog-field">
        <FileUploadInput
          files={files}
          onChange={setFiles}
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          placeholder={t('pages.approvals.resubmit.attachFiles')}
          disabled={resubmitMutation.isPending}
        />
      </div>
    </ConfirmDialog>
  );
}

/**
 * Compact list of prior responses for approvers / history.
 */
export function ResponseHistory({
  responses,
}: {
  responses: ApprovalResponse[];
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!responses.length) {
    return null;
  }

  return (
    <section
      className="erp-resubmit-history"
      aria-labelledby="erp-resubmit-history-title"
    >
      <div className="erp-resubmit-history-header">
        <h3 id="erp-resubmit-history-title" className="erp-resubmit-history-title">
          {t('pages.approvals.resubmit.historyTitle')}
        </h3>
        <span className="erp-users-count-pill">
          {responses.length.toLocaleString()}
        </span>
      </div>
      <ul className="erp-resubmit-history-list">
        {responses.map((response) => (
          <li key={response.id} className="erp-resubmit-history-item">
            <div className="erp-resubmit-history-item-top">
              <p className="erp-resubmit-history-item-label">
                {response.responseType === 'RESUBMIT'
                  ? t('pages.approvals.resubmit.resubmitLabel')
                  : t('pages.approvals.resubmit.conditionResponse', {
                      index: (response.conditionIndex ?? 0) + 1,
                    })}
              </p>
              <p className="erp-resubmit-history-item-meta">
                {formatApprovalUserName(response.responder)} ·{' '}
                {formatDisplayDateTime(response.createdAt)}
              </p>
            </div>
            {response.note?.trim() ? (
              <p className="erp-resubmit-history-item-note">
                {response.note}
              </p>
            ) : null}
            {(response.documents?.length ?? 0) > 0 ? (
              <div className="erp-resubmit-history-item-docs">
                <DocumentPreviewGroup
                  documents={response.documents?.map((link) => ({
                    id: link.documentId,
                    name:
                      link.document?.name ??
                      t('pages.approvals.resubmit.attachment'),
                    fileType: link.document?.fileType,
                    fileSizeBytes: link.document?.fileSizeBytes,
                  }))}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
