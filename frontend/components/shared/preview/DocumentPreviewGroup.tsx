'use client';

import { useMemo, useRef, useState } from 'react';
import { Typography } from 'antd';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import DocumentPreview from './DocumentPreview';
import ImageLightbox from './ImageLightbox';
import {
  PreviewGroupContext,
  resolvePreviewKind,
  usePreviewGroup,
  type PreviewDocument,
  type PreviewGroupContextValue,
} from './preview-context';
import { triggerUrlDownload } from '@/lib/utils/document-download';
import {
  documentDownloadPath,
  documentPreviewPath,
  fetchSignedUrl,
  isSignedUrlFresh,
  signedUrlErrorMessage,
  type SignedUrlResult,
} from './useSignedUrl';

export interface DocumentPreviewGroupProps {
  /** Every file on the record; only images join the lightbox. */
  documents: PreviewDocument[] | undefined;
  /**
   * Custom layout (e.g. a table whose cells render `DocumentPreview`). When
   * omitted, the documents render as preview chips.
   */
  children?: React.ReactNode;
  /** Shown instead of the default chips when there are no documents. */
  emptyLabel?: string;
  /** Default chips as compact icon buttons (table cells). */
  compact?: boolean;
}

/**
 * Groups a record's files so its images open in one lightbox and can be
 * navigated with the arrow keys. PDFs and other files keep their own chips.
 * Each image's signed URL is fetched when it is first shown in the lightbox.
 *
 * Groups nest: an image also registered in an enclosing group (e.g. the
 * table-level group around per-row receipts) opens in the outer lightbox.
 */
export default function DocumentPreviewGroup({
  documents,
  children,
  emptyLabel,
  compact = false,
}: DocumentPreviewGroupProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const parent = usePreviewGroup();
  const items = useMemo(() => documents ?? [], [documents]);
  const images = useMemo(
    () =>
      items.filter(
        (doc) => resolvePreviewKind(doc.fileType, doc.name) === 'image',
      ),
    [items],
  );

  const [fetched, setFetched] = useState<Record<string, SignedUrlResult>>({});
  const [known, setKnown] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const inflightRef = useRef(new Set<string>());

  function srcFor(doc: PreviewDocument): string | null {
    const result = fetched[doc.id];
    if (isSignedUrlFresh(result)) {
      return result.url;
    }
    return doc.thumbnailUrl ?? known[doc.id] ?? null;
  }

  async function load(doc: PreviewDocument): Promise<boolean> {
    if (inflightRef.current.has(doc.id)) {
      return true;
    }
    inflightRef.current.add(doc.id);
    try {
      const result = await fetchSignedUrl(
        doc.urlPath ?? documentPreviewPath(doc.id),
      );
      setFetched((prev) => ({ ...prev, [doc.id]: result }));
      return true;
    } catch {
      messageApi.error(t('common.previewLoadError'));
      return false;
    } finally {
      inflightRef.current.delete(doc.id);
    }
  }

  async function download(doc: PreviewDocument): Promise<void> {
    try {
      const { url } = await fetchSignedUrl(
        doc.urlPath ?? documentDownloadPath(doc.id),
      );
      triggerUrlDownload(url, doc.name);
    } catch (error: unknown) {
      messageApi.error(signedUrlErrorMessage(error));
    }
  }

  const ownsImage = (documentId: string): boolean =>
    images.some((doc) => doc.id === documentId);

  async function openImage(
    documentId: string,
    knownUrl?: string | null,
  ): Promise<void> {
    if (parent?.hasImage(documentId)) {
      parent.openImage(documentId, knownUrl);
      return;
    }
    const index = images.findIndex((doc) => doc.id === documentId);
    const doc = images[index];
    if (!doc) {
      return;
    }
    if (knownUrl) {
      setKnown((prev) => ({ ...prev, [documentId]: knownUrl }));
    } else if (!srcFor(doc)) {
      setLoadingId(documentId);
      const loaded = await load(doc);
      setLoadingId(null);
      if (!loaded) {
        return;
      }
    }
    setCurrent(index);
    setOpen(true);
  }

  function handleChange(next: number): void {
    setCurrent(next);
    const doc = images[next];
    if (doc && !srcFor(doc)) {
      void load(doc);
    }
  }

  const contextValue: PreviewGroupContextValue = {
    hasImage: (documentId) =>
      ownsImage(documentId) || Boolean(parent?.hasImage(documentId)),
    openImage: (documentId, knownUrl) => void openImage(documentId, knownUrl),
    loadingId: loadingId ?? parent?.loadingId ?? null,
  };

  let content: React.ReactNode = children;
  if (children === undefined) {
    if (items.length === 0) {
      content = emptyLabel ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {emptyLabel}
        </Typography.Text>
      ) : null;
    } else if (compact) {
      content = (
        <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
          {items.map((doc) => (
            <li key={doc.id} className="inline-flex">
              <DocumentPreview
                variant="compact"
                documentId={doc.id}
                fileName={doc.name}
                fileType={doc.fileType}
                fileSizeBytes={doc.fileSizeBytes}
                thumbnailUrl={doc.thumbnailUrl}
                urlPath={doc.urlPath}
              />
            </li>
          ))}
        </ul>
      );
    } else {
      content = (
        <div className="erp-profile-docs-grid">
          {items.map((doc) => (
            <DocumentPreview
              key={doc.id}
              documentId={doc.id}
              fileName={doc.name}
              fileType={doc.fileType}
              fileSizeBytes={doc.fileSizeBytes}
              thumbnailUrl={doc.thumbnailUrl}
              urlPath={doc.urlPath}
            />
          ))}
        </div>
      );
    }
  }

  return (
    <PreviewGroupContext.Provider value={contextValue}>
      {content}
      <ImageLightbox
        open={open}
        current={current}
        images={images.map((doc) => ({ src: srcFor(doc), alt: doc.name }))}
        onClose={() => setOpen(false)}
        onChange={handleChange}
        onDownload={(index) => {
          const doc = images[index];
          if (doc) {
            void download(doc);
          }
        }}
      />
    </PreviewGroupContext.Provider>
  );
}
