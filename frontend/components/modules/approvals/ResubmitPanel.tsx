'use client';

import { useState } from 'react';
import { Button, Input, Space, Typography, Upload } from 'antd';
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalResponse } from '@/lib/api/approvals.types';
import { useResubmitApprovalRequest } from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
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
      messageApi.success('Request resubmitted');
      setNote('');
      setFiles([]);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to resubmit', messageApi);
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        border: `1px solid ${tokens.colorPrimary}`,
        background: tokens.colorPrimaryLight,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Resubmit
      </Typography.Title>
      {returnNote?.trim() ? (
        <Typography.Paragraph style={{ marginBottom: 12 }}>
          <Typography.Text strong>Return note: </Typography.Text>
          {returnNote.trim()}
        </Typography.Paragraph>
      ) : null}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Note to approver (optional)
      </Typography.Text>
      <Input.TextArea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        showCount
        placeholder="Explain what you changed…"
      />
      <div style={{ marginTop: 12 }}>
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
          <Button icon={<UploadOutlined />}>Attach files</Button>
        </Upload>
      </div>
      <Button
        type="primary"
        style={{ marginTop: 12 }}
        loading={resubmitMutation.isPending}
        onClick={() => void handleSubmit()}
      >
        Resubmit
      </Button>
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
  if (!responses.length) {
    return null;
  }

  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Resubmission / response history
      </Typography.Title>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        {responses.map((response) => (
          <div
            key={response.id}
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${tokens.colorBorder}`,
              background: tokens.colorCardBg,
            }}
          >
            <Typography.Text strong>
              {response.responseType === 'RESUBMIT'
                ? 'Resubmit'
                : `Condition #${(response.conditionIndex ?? 0) + 1} response`}
            </Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatApprovalUserName(response.responder)} ·{' '}
                {formatDisplayDateTime(response.createdAt)}
              </Typography.Text>
            </div>
            {response.note?.trim() ? (
              <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                {response.note}
              </Typography.Paragraph>
            ) : null}
            {(response.documents?.length ?? 0) > 0 ? (
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                {response.documents?.map((link) => (
                  <li key={link.id}>
                    <Typography.Link
                      href={`/api/documents/${link.documentId}/download-url`}
                      onClick={(e) => {
                        e.preventDefault();
                        void (async () => {
                          const { apiGet } = await import('@/lib/api/client');
                          const { url } = await apiGet<{ url: string }>(
                            `/documents/${link.documentId}/download-url`,
                          );
                          window.open(url, '_blank', 'noopener,noreferrer');
                        })();
                      }}
                    >
                      <PaperClipOutlined /> {link.document?.name ?? 'Attachment'}
                    </Typography.Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </Space>
    </div>
  );
}
