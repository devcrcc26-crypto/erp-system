'use client';

import { Button, Typography } from 'antd';
import { Download } from 'lucide-react';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import { downloadDocument } from '@/lib/utils/document-download';
import { tokens } from '@/lib/theme/tokens';

export interface AttachmentDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

/**
 * Renders downloadable attachment links via presigned document URLs.
 */
export default function AttachmentDownloadList({
  documents,
  emptyLabel = 'No attachments',
}: {
  documents: AttachmentDocumentSummary[] | undefined;
  emptyLabel?: string;
}): React.ReactNode {
  const message = useAppMessage();
  const items = documents ?? [];

  async function handleDownload(
    documentId: string,
    fileName: string,
  ): Promise<void> {
    try {
      await downloadDocument(documentId, fileName);
    } catch (error) {
      const text =
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to download attachment';
      message.error(text);
    }
  }

  if (items.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyLabel}
      </Typography.Text>
    );
  }

  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {items.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorPageBg,
          }}
        >
          <Typography.Text ellipsis className="min-w-0 flex-1 text-sm">
            {doc.name}
          </Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<Download size={14} />}
            onClick={() => void handleDownload(doc.id, doc.name)}
          >
            Download
          </Button>
        </li>
      ))}
    </ul>
  );
}
