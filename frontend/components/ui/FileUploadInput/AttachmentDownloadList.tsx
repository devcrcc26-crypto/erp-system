'use client';

import { Button, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import {
  DocumentPreview,
  DocumentPreviewGroup,
} from '@/components/shared/preview';

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
 * Pass `onRemove` to show a delete control on each file.
 */
export default function AttachmentDownloadList({
  documents,
  emptyLabel = 'No attachments',
  compact = false,
  onRemove,
  removingId,
  removeLabel = 'Remove',
}: {
  documents: AttachmentDocumentSummary[] | undefined;
  emptyLabel?: string;
  compact?: boolean;
  onRemove?: (documentId: string) => void;
  removingId?: string | null;
  removeLabel?: string;
}): React.ReactNode {
  const items = documents ?? [];
  const canRemove = typeof onRemove === 'function';

  if (!canRemove) {
    return (
      <DocumentPreviewGroup
        documents={documents}
        emptyLabel={emptyLabel}
        compact={compact}
      />
    );
  }

  if (items.length === 0) {
    return (
      <DocumentPreviewGroup documents={[]} emptyLabel={emptyLabel} compact={compact} />
    );
  }

  return (
    <DocumentPreviewGroup documents={items}>
      <ul
        className={
          compact
            ? 'm-0 flex list-none flex-wrap items-center gap-1 p-0'
            : 'erp-profile-docs-grid m-0 list-none p-0'
        }
      >
        {items.map((doc) => (
          <li key={doc.id} className={compact ? 'inline-flex' : undefined}>
            <DocumentPreview
              variant={compact ? 'compact' : 'card'}
              documentId={doc.id}
              fileName={doc.name}
              fileType={doc.fileType}
              fileSizeBytes={doc.fileSizeBytes}
              extraActions={
                <Tooltip title={removeLabel}>
                  <Button
                    type="text"
                    danger
                    size="small"
                    className="erp-profile-doc-card-action"
                    icon={<DeleteOutlined />}
                    loading={removingId === doc.id}
                    disabled={removingId != null && removingId !== doc.id}
                    aria-label={removeLabel}
                    onClick={() => onRemove(doc.id)}
                  />
                </Tooltip>
              }
            />
          </li>
        ))}
      </ul>
    </DocumentPreviewGroup>
  );
}
