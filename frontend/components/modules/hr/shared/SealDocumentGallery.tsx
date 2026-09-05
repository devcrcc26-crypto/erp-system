'use client';

import { useState } from 'react';
import { Button, Typography } from 'antd';
import { Download, Stamp } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { AttachmentDocumentSummary } from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { downloadDocument } from '@/lib/utils/document-download';
import {
  formatSealFileSize,
  resolveSealFileKind,
} from '@/lib/utils/seal-file-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * File presentations for Official / Project Seal document sections.
 * - tiles: icon cards in a responsive grid (document to seal)
 * - proof: featured stamp-style card (sealed proof)
 */
export default function SealDocumentGallery({
  documents,
  emptyLabel = 'No attachments',
  variant = 'tiles',
}: {
  documents: AttachmentDocumentSummary[] | undefined;
  emptyLabel?: string;
  variant?: 'tiles' | 'proof';
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const message = useAppMessage();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const items = documents ?? [];

  async function handleDownload(
    documentId: string,
    fileName: string,
  ): Promise<void> {
    setDownloadingId(documentId);
    try {
      await downloadDocument(documentId, fileName);
    } catch (error) {
      const text =
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to download attachment';
      message.error(text);
    } finally {
      setDownloadingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyLabel}
      </Typography.Text>
    );
  }

  if (variant === 'proof') {
    return (
      <div className="flex flex-col gap-3">
        {items.map((doc) => {
          const meta = resolveSealFileKind(doc.name, doc.fileType);
          const sizeLabel = formatSealFileSize(doc.fileSizeBytes);
          return (
            <div
              key={doc.id}
              className="relative overflow-hidden rounded-xl"
              style={{
                border: `1px solid ${tokens.colorBorder}`,
                background: `linear-gradient(135deg, ${meta.soft} 0%, ${tokens.colorCardBg} 55%)`,
              }}
            >
              <div
                className="pointer-events-none absolute -right-3 -top-3 opacity-[0.12]"
                aria-hidden
              >
                <Stamp size={96} style={{ color: meta.accent }} />
              </div>
              <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <ProfileFileTypeIcon
                    name={doc.name}
                    fileType={doc.fileType}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p
                      className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: meta.accent }}
                    >
                      {t('hr.section.sealedProof')}
                    </p>
                    <p
                      className="m-0 mt-1 truncate text-sm font-semibold"
                      style={{ color: tokens.colorTextPrimary }}
                      title={doc.name}
                    >
                      {doc.name}
                    </p>
                    <p
                      className="m-0 mt-1 text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
                      {[meta.label, sizeLabel].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <Button
                  type="primary"
                  icon={<Download size={14} />}
                  loading={downloadingId === doc.id}
                  onClick={() => void handleDownload(doc.id, doc.name)}
                >
                  {t('common.download')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {items.map((doc) => (
        <li key={doc.id}>
          <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors"
            style={{
              borderColor: tokens.colorBorder,
              background: tokens.colorCardBg,
            }}
            onClick={() => void handleDownload(doc.id, doc.name)}
            disabled={downloadingId === doc.id}
          >
            <ProfileFileTypeIcon
              name={doc.name}
              fileType={doc.fileType}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p
                className="m-0 truncate text-sm font-medium"
                style={{ color: tokens.colorTextPrimary }}
                title={doc.name}
              >
                {doc.name}
              </p>
              <p
                className="m-0 mt-0.5 text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {profileFileMetaLine(
                  doc.name,
                  doc.fileType,
                  doc.fileSizeBytes,
                ) || t('hr.labels.attachment')}
              </p>
            </div>
            <Download
              size={16}
              className="shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
              style={{ color: tokens.colorPrimary }}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
