'use client';

import { useState } from 'react';
import { Button, Typography } from 'antd';
import {
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Stamp,
} from 'lucide-react';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { AttachmentDocumentSummary } from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { downloadDocument } from '@/lib/utils/document-download';
import { tokens } from '@/lib/theme/tokens';

type FileKind = 'pdf' | 'word' | 'excel' | 'image' | 'cad' | 'archive' | 'other';

interface FileKindMeta {
  kind: FileKind;
  label: string;
  accent: string;
  soft: string;
  Icon: typeof FileText;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionFromName(name: string): string {
  const parts = name.split('.');
  if (parts.length < 2) {
    return '';
  }
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

function resolveFileKind(doc: AttachmentDocumentSummary): FileKindMeta {
  const ext = extensionFromName(doc.name);
  const mime = (doc.fileType ?? '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      kind: 'pdf',
      label: 'PDF',
      accent: '#DC2626',
      soft: '#FEF2F2',
      Icon: FileText,
    };
  }
  if (
    ['doc', 'docx', 'rtf'].includes(ext) ||
    mime.includes('word') ||
    mime.includes('msword')
  ) {
    return {
      kind: 'word',
      label: 'WORD',
      accent: '#2563EB',
      soft: '#EFF6FF',
      Icon: FileText,
    };
  }
  if (
    ['xls', 'xlsx', 'csv'].includes(ext) ||
    mime.includes('sheet') ||
    mime.includes('excel')
  ) {
    return {
      kind: 'excel',
      label: 'EXCEL',
      accent: '#059669',
      soft: '#ECFDF5',
      Icon: FileSpreadsheet,
    };
  }
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ||
    mime.startsWith('image/')
  ) {
    return {
      kind: 'image',
      label: 'IMAGE',
      accent: '#7C3AED',
      soft: '#F5F3FF',
      Icon: FileImage,
    };
  }
  if (
    ['dwg', 'dxf', 'dwf', 'dgn', 'drw', 'rvt', 'rfa', 'ifc', 'stp', 'step'].includes(
      ext,
    )
  ) {
    return {
      kind: 'cad',
      label: 'CAD',
      accent: '#D4610A',
      soft: '#FEF0E6',
      Icon: File,
    };
  }
  if (['zip', '7z', 'rar'].includes(ext) || mime.includes('zip')) {
    return {
      kind: 'archive',
      label: 'ZIP',
      accent: '#6B7280',
      soft: '#F3F4F6',
      Icon: FileArchive,
    };
  }
  return {
    kind: 'other',
    label: (ext || 'FILE').toUpperCase(),
    accent: tokens.colorTextSecondary,
    soft: tokens.colorPageBg,
    Icon: File,
  };
}

/**
 * Experimental file presentations for Official Seal document sections.
 * - tiles: icon cards in a responsive grid (document to seal)
 * - proof: featured stamp-style card (sealed proof)
 */
export default function OfficialSealDocumentGallery({
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
          const meta = resolveFileKind(doc);
          const sizeLabel = formatFileSize(doc.fileSizeBytes);
          return (
            <div
              key={doc.id}
              className="relative overflow-hidden rounded-none"
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
                  <div
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-none"
                    style={{
                      background: tokens.colorCardBg,
                      border: `2px solid ${meta.accent}`,
                      color: meta.accent,
                    }}
                  >
                    <meta.Icon size={22} strokeWidth={1.75} />
                    <span className="mt-0.5 text-[9px] font-bold tracking-wide">
                      {meta.label}
                    </span>
                  </div>
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
                  style={{ borderRadius: 0 }}
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
      {items.map((doc) => {
        const meta = resolveFileKind(doc);
        const sizeLabel = formatFileSize(doc.fileSizeBytes);
        return (
          <li key={doc.id}>
            <button
              type="button"
              className="group flex w-full items-center gap-3 rounded-none border px-3 py-3 text-left transition-colors"
              style={{
                borderColor: tokens.colorBorder,
                background: tokens.colorCardBg,
              }}
              onClick={() => void handleDownload(doc.id, doc.name)}
              disabled={downloadingId === doc.id}
            >
              <div
                className="relative flex h-12 w-10 shrink-0 items-end justify-center pb-1.5"
                aria-hidden
              >
                <div
                  className="absolute inset-0 rounded-[2px]"
                  style={{
                    background: meta.soft,
                    border: `1px solid ${meta.accent}33`,
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-t-[10px] border-l-transparent"
                  style={{ borderTopColor: meta.accent }}
                />
                <span
                  className="relative z-[1] text-[9px] font-bold tracking-wide"
                  style={{ color: meta.accent }}
                >
                  {meta.label}
                </span>
              </div>
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
                  {[meta.label, sizeLabel].filter(Boolean).join(' · ') ||
                    t('hr.labels.attachment')}
                </p>
              </div>
              <Download
                size={16}
                className="shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
                style={{ color: tokens.colorPrimary }}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
