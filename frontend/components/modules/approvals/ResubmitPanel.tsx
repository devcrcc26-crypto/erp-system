'use client';

import { useState } from 'react';
import { Button, Input } from 'antd';
import { RotateCcw, Send } from 'lucide-react';
import { DocumentPreviewGroup } from '@/components/shared/preview';
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
 * Requester panel to resubmit a RETURNED approval with optional attachments.
 */
export default function ResubmitPanel({
  requestId,
  returnNote,
}: {
  requestId: string;
  returnNote?: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const resubmitMutation = useResubmitApprovalRequest(requestId);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  async function handleSubmit(): Promise<void> {
    try {
      await resubmitMutation.mutateAsync({
        note: note.trim() || undefined,
        files,
      });
      messageApi.success(t('pages.approvals.resubmit.success'));
      setNote('');
      setFiles([]);
    } catch (error: unknown) {
      notifyApiError(error, t('pages.approvals.resubmit.failed'), messageApi);
    }
  }

  return (
    <section className="erp-resubmit-card" aria-labelledby="erp-resubmit-title">
      <div className="erp-resubmit-card-header">
        <span className="erp-resubmit-card-icon" aria-hidden>
          <RotateCcw size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 id="erp-resubmit-title" className="erp-resubmit-card-title">
            {t('pages.approvals.resubmit.title')}
          </h3>
          <p className="erp-resubmit-card-subtitle">
            {t('pages.approvals.returnedHint')}
          </p>
        </div>
      </div>

      <div className="erp-resubmit-card-body">
        {returnNote?.trim() ? (
          <div className="erp-resubmit-return-note">
            <p className="erp-resubmit-return-note-label">
              {t('pages.approvals.resubmit.returnNote')}
            </p>
            <p className="erp-resubmit-return-note-text">{returnNote.trim()}</p>
          </div>
        ) : null}

        <div className="erp-resubmit-field">
          <p className="erp-resubmit-field-label">
            {t('pages.approvals.resubmit.noteLabel')}
          </p>
          <Input.TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            showCount
            placeholder={t('pages.approvals.resubmit.notePlaceholder')}
            className="erp-resubmit-textarea"
          />
        </div>

        <div className="erp-resubmit-field">
          <FileUploadInput
            files={files}
            onChange={setFiles}
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            placeholder={t('pages.approvals.resubmit.attachFiles')}
            disabled={resubmitMutation.isPending}
          />
        </div>

        <div className="erp-resubmit-actions">
          <Button
            type="primary"
            icon={<Send size={14} strokeWidth={2.25} aria-hidden />}
            loading={resubmitMutation.isPending}
            onClick={() => void handleSubmit()}
            className="erp-resubmit-submit"
          >
            {t('pages.approvals.resubmit.submit')}
          </Button>
        </div>
      </div>
    </section>
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
