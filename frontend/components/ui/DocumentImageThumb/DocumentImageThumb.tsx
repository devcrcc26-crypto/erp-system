'use client';

import { Avatar, Spin, Tooltip } from 'antd';
import { ImageOff } from 'lucide-react';
import { useDocumentDownloadUrl } from '@/lib/query/documents';
import { tokens } from '@/lib/theme/tokens';

/**
 * Inline thumbnail for a document image (exit-permit / PR item photos, etc.).
 */
export default function DocumentImageThumb({
  documentId,
  alt,
  size = 40,
  emptyLabel,
}: {
  documentId?: string | null;
  alt?: string;
  size?: number;
  emptyLabel?: string;
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

  return (
    <Spin spinning={photoQuery.isLoading} size="small">
      <Avatar
        size={size}
        shape="square"
        src={photoQuery.data?.url}
        alt={alt}
        icon={
          !photoQuery.data?.url ? (
            <ImageOff size={Math.max(14, Math.round(size * 0.4))} />
          ) : undefined
        }
        style={{
          backgroundColor: photoQuery.data?.url ? undefined : tokens.colorTeal50,
          color: photoQuery.data?.url ? undefined : tokens.colorTeal400,
          flexShrink: 0,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
        }}
      />
    </Spin>
  );
}
