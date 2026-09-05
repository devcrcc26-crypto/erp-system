'use client';

import { Button, Typography } from 'antd';
import { Download } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
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
 * Downloadable attachments with file-type icons (PDF, Word, image, etc.).
 * Use `compact` in table cells (icon + download only).
 */
export default function AttachmentDownloadList({
  documents,
  emptyLabel = 'No attachments',
  compact = false,
}: {
  documents: AttachmentDocumentSummary[] | undefined;
  emptyLabel?: string;
  compact?: boolean;
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

  if (compact) {
    return (
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {items.map((doc) => (
          <li key={doc.id} className="inline-flex items-center gap-0.5">
            <span className="inline-flex" title={doc.name}>
              <ProfileFileTypeIcon
                name={doc.name}
                fileType={doc.fileType}
                size="sm"
              />
            </span>
            <Button
              type="text"
              size="small"
              icon={<Download size={14} strokeWidth={1.75} />}
              aria-label={`Download ${doc.name}`}
              onClick={() => void handleDownload(doc.id, doc.name)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
      {items.map((doc) => (
        <li key={doc.id}>
          <div
            className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{
              borderColor: tokens.colorBorder,
              background: tokens.colorCardBg,
            }}
          >
            <ProfileFileTypeIcon
              name={doc.name}
              fileType={doc.fileType}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <Typography.Text
                ellipsis
                className="block text-sm font-medium"
                title={doc.name}
              >
                {doc.name}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                className="block text-xs"
                style={{ fontSize: 12 }}
              >
                {profileFileMetaLine(
                  doc.name,
                  doc.fileType,
                  doc.fileSizeBytes,
                ) || 'File'}
              </Typography.Text>
            </div>
            <Button
              type="text"
              size="small"
              icon={<Download size={14} strokeWidth={1.75} />}
              aria-label={`Download ${doc.name}`}
              onClick={() => void handleDownload(doc.id, doc.name)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
