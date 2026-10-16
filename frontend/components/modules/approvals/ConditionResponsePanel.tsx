'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalResponse } from '@/lib/api/approvals.types';
import { useRespondToApprovalCondition } from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * Requester panel to respond to one unresolved condition.
 */
export default function ConditionResponsePanel({
  requestId,
  conditionIndex,
  conditionText,
  existingResponses,
}: {
  requestId: string;
  conditionIndex: number;
  conditionText: string;
  existingResponses: ApprovalResponse[];
}): React.ReactNode {
  const messageApi = useAppMessage();
  const respondMutation = useRespondToApprovalCondition(requestId);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const alreadyResponded = useMemo(
    () =>
      existingResponses.some(
        (r) =>
          r.responseType === 'CONDITION_RESPONSE' &&
          r.conditionIndex === conditionIndex,
      ),
    [existingResponses, conditionIndex],
  );

  const latestResponse = useMemo(
    () =>
      [...existingResponses]
        .reverse()
        .find(
          (r) =>
            r.responseType === 'CONDITION_RESPONSE' &&
            r.conditionIndex === conditionIndex,
        ),
    [existingResponses, conditionIndex],
  );

  async function handleSubmit(): Promise<void> {
    if (!note.trim() && files.length === 0) {
      messageApi.warning('Add a response note or attachment');
      return;
    }
    try {
      await respondMutation.mutateAsync({
        conditionIndex,
        note: note.trim() || undefined,
        files,
      });
      messageApi.success('Response submitted');
      setNote('');
      setFiles([]);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit response', messageApi);
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 8,
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
        Condition
      </Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 12 }}>
        {conditionText}
      </Typography.Paragraph>

      {alreadyResponded ? (
        <Typography.Text type="secondary">
          Response submitted - awaiting review
          {latestResponse?.note?.trim()
            ? `: “${latestResponse.note.trim()}”`
            : ''}
        </Typography.Text>
      ) : (
        <>
          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginBottom: 8 }}
          >
            Your response
          </Typography.Text>
          <Input.TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            showCount
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
            loading={respondMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            Submit response
          </Button>
        </>
      )}
    </div>
  );
}
