'use client';

import { useState } from 'react';
import { Button, Input, Upload } from 'antd';
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalResponse } from '@/lib/api/approvals.types';
import { useResubmitApprovalRequest } from '@/lib/query/approvals';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatApprovalUserName } from '@/lib/utils/approval-display';

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
    <div className="overflow-hidden rounded-xl border border-[var(--color-primary,#F47B20)] bg-[var(--color-primary-light,#FEF0E6)]">
      <div className="border-b border-[rgba(244,123,32,0.2)] px-4 py-3">
        <h3 className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">
          {t('pages.approvals.resubmit.title')}
        </h3>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {returnNote?.trim() ? (
          <p className="m-0 text-sm leading-relaxed text-[var(--color-text-primary)]">
            <span className="font-semibold">
              {t('pages.approvals.resubmit.returnNote')}:{' '}
            </span>
            {returnNote.trim()}
          </p>
        ) : null}
        <div>
          <p className="erp-users-stat-label m-0 mb-1.5">
            {t('pages.approvals.resubmit.noteLabel')}
          </p>
          <Input.TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            showCount
            placeholder={t('pages.approvals.resubmit.notePlaceholder')}
          />
        </div>
        <Upload
          multiple
          beforeUpload={(file) => {
            setFiles((prev) => [...prev, file]);
            return false;
          }}
          onRemove={(file) => {
            setFiles((prev) => prev.filter((f) => f.name !== file.name));
          }}
          fileList={files.map((f, i) => ({
            uid: `${i}-${f.name}`,
            name: f.name,
            status: 'done' as const,
          }))}
        >
          <Button icon={<UploadOutlined />}>
            {t('pages.approvals.resubmit.attachFiles')}
          </Button>
        </Upload>
        <div>
          <Button
            type="primary"
            loading={resubmitMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            {t('pages.approvals.resubmit.submit')}
          </Button>
        </div>
      </div>
    </div>
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
    <SectionCard title={t('pages.approvals.resubmit.historyTitle')}>
      <div className="flex flex-col gap-3">
        {responses.map((response) => (
          <div
            key={response.id}
            className="rounded-xl border border-[#e8ebef] bg-[#f8fafc] p-3"
          >
            <p className="erp-users-cell-strong m-0 text-sm">
              {response.responseType === 'RESUBMIT'
                ? t('pages.approvals.resubmit.resubmitLabel')
                : t('pages.approvals.resubmit.conditionResponse', {
                    index: (response.conditionIndex ?? 0) + 1,
                  })}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1 text-xs">
              {formatApprovalUserName(response.responder)} ·{' '}
              {formatDisplayDateTime(response.createdAt)}
            </p>
            {response.note?.trim() ? (
              <p className="m-0 mt-2 text-sm leading-relaxed text-[var(--color-text-primary)]">
                {response.note}
              </p>
            ) : null}
            {(response.documents?.length ?? 0) > 0 ? (
              <ul className="m-0 mt-2 list-none space-y-1 p-0">
                {response.documents?.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-sm text-[var(--color-primary,#F47B20)] hover:underline"
                      onClick={() => {
                        void (async () => {
                          const { apiGet } = await import('@/lib/api/client');
                          const { url } = await apiGet<{ url: string }>(
                            `/documents/${link.documentId}/download-url`,
                          );
                          window.open(url, '_blank', 'noopener,noreferrer');
                        })();
                      }}
                    >
                      <PaperClipOutlined />{' '}
                      {link.document?.name ??
                        t('pages.approvals.resubmit.attachment')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
