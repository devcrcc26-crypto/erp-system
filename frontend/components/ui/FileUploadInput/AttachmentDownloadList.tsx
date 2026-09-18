'use client';

import { DocumentPreviewGroup } from '@/components/shared/preview';

export interface AttachmentDocumentSummary {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

/**
 * Attachments with file-type icons: images and PDFs can be previewed in
 * place, every file can be downloaded. Images on the list share one
 * lightbox. Use `compact` in table cells (icon + preview / download only).
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
  return (
    <DocumentPreviewGroup
      documents={documents}
      emptyLabel={emptyLabel}
      compact={compact}
    />
  );
}
