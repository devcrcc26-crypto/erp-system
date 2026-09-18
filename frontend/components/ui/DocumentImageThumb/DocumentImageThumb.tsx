'use client';

import { Avatar, Spin, Tooltip } from 'antd';
import { ImageOff } from 'lucide-react';
import { DocumentPreview } from '@/components/shared/preview';
import { useDocumentDownloadUrl } from '@/lib/query/documents';
import { tokens } from '@/lib/theme/tokens';

/**
 * Inline thumbnail for a document image (exit-permit / PR item photos, etc.).
 * Clicking it opens the full image in the lightbox (the record's
 * `DocumentPreviewGroup` lightbox when there is one).
 */
export default function DocumentImageThumb({
  documentId,
  alt,
  size = 40,
  emptyLabel,
  fileName,
  fileType,
}: {
  documentId?: string | null;
  alt?: string;
  size?: number;
  emptyLabel?: string;
  /** Stored file name (lightbox caption); defaults to `alt`. */
  fileName?: string | null;
  /** MIME type when known; item photo uploads are images only. */
  fileType?: string | null;
}): React.ReactNode {
  const photoQuery = useDocumentDownloadUrl(
    documentId ?? '',
    Boolean(documentId),
  );

  if (!documentId) {
    const placeholder = (
      <span
        className="inline-flex items-center justify-center rounded-lg border border-[#e8ebef] bg-[#f8f9fb] text-[#9AA4B2]"
        style={{ width: size, height: size }}
        aria-label={emptyLabel}
      >
        <ImageOff size={Math.max(14, Math.round(size * 0.4))} strokeWidth={1.75} />
      </span>
    );
    return emptyLabel ? (
      <Tooltip title={emptyLabel}>{placeholder}</Tooltip>
    ) : (
      placeholder
    );
  }

  if (photoQuery.data?.url) {
    return (
      <DocumentPreview
        variant="thumbnail"
        documentId={documentId}
        fileName={fileName || alt || 'Image'}
        fileType={fileType || 'image/jpeg'}
        thumbnailUrl={photoQuery.data.url}
        thumbnailSize={size}
        showDownload={false}
      />
    );
  }

  return (
    <Spin spinning={photoQuery.isLoading} size="small">
      <Avatar
        size={size}
        shape="square"
        alt={alt}
        icon={<ImageOff size={Math.max(14, Math.round(size * 0.4))} />}
        style={{
          backgroundColor: tokens.colorTeal50,
          color: tokens.colorTeal400,
          flexShrink: 0,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
        }}
      />
    </Spin>
  );
}
