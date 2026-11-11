'use client';

import { useState } from 'react';
import { Button, Image, Spin, Tooltip } from 'antd';
import { Download, Eye } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { triggerUrlDownload } from '@/lib/utils/document-download';
import { tokens } from '@/lib/theme/tokens';
import ImageLightbox from './ImageLightbox';
import PdfPreviewModal from './PdfPreviewModal';
import {
  resolvePreviewKind,
  usePreviewGroup,
  type PreviewDocument,
  type PreviewKind,
} from './preview-context';
import {
  documentDownloadPath,
  documentPreviewPath,
  fetchSignedUrl,
  signedUrlErrorMessage,
  useSignedUrl,
} from './useSignedUrl';

export interface DocumentPreviewActionState {
  kind: PreviewKind;
  /** Images and PDFs can be previewed; other files are download-only. */
  canPreview: boolean;
  preview: () => void;
  previewLoading: boolean;
  download: () => void;
  downloading: boolean;
}

function stopPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * Preview + download behaviour for one file, for layouts that draw their own
 * controls (seal tiles, table cells, profile cards). Signed URLs are only
 * requested when `preview()` / `download()` run. Images inside a
 * `DocumentPreviewGroup` open in the group's lightbox.
 */
export function DocumentPreviewActions({
  document,
  children,
}: {
  document: PreviewDocument;
  children: (actions: DocumentPreviewActionState) => React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const group = usePreviewGroup();
  const kind = resolvePreviewKind(document.fileType, document.name);
  const signedUrl = useSignedUrl(kind === 'none' ? null : document.id, {
    path: document.urlPath ?? documentPreviewPath(document.id),
  });
  const [viewer, setViewer] = useState<'image' | 'pdf' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const inGroup = kind === 'image' && Boolean(group?.hasImage(document.id));

  async function preview(): Promise<void> {
    if (kind === 'none') {
      return;
    }
    if (inGroup && group) {
      group.openImage(document.id, document.thumbnailUrl);
      return;
    }
    if (kind === 'image' && document.thumbnailUrl) {
      setViewer('image');
      return;
    }
    const url = await signedUrl.fetch();
    if (!url) {
      messageApi.error(t('common.previewLoadError'));
      return;
    }
    setViewer(kind);
  }

  async function download(): Promise<void> {
    setDownloading(true);
    try {
      const { url } = await fetchSignedUrl(
        document.urlPath ?? documentDownloadPath(document.id),
      );
      triggerUrlDownload(url, document.name);
    } catch (error: unknown) {
      messageApi.error(signedUrlErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  const imageSrc = document.thumbnailUrl ?? signedUrl.url;

  return (
    <>
      {children({
        kind,
        canPreview: kind !== 'none',
        preview: () => void preview(),
        previewLoading: inGroup
          ? group?.loadingId === document.id
          : signedUrl.loading,
        download: () => void download(),
        downloading,
      })}
      {kind === 'pdf' && signedUrl.url ? (
        <span className="contents" onClick={stopPropagation}>
          <PdfPreviewModal
            open={viewer === 'pdf'}
            onClose={() => setViewer(null)}
            signedUrl={signedUrl.url}
            fileName={document.name}
            fileSizeBytes={document.fileSizeBytes}
            onDownload={() => void download()}
            downloading={downloading}
          />
        </span>
      ) : null}
      {kind === 'image' && !inGroup && imageSrc ? (
        <ImageLightbox
          open={viewer === 'image'}
          images={[{ src: imageSrc, alt: document.name }]}
          onClose={() => setViewer(null)}
          onDownload={() => void download()}
        />
      ) : null}
    </>
  );
}

export interface DocumentPreviewProps {
  documentId: string;
  fileName: string;
  /** MIME type e.g. 'image/jpeg', 'application/pdf'. */
  fileType?: string | null;
  fileSizeBytes?: number | null;
  /** Optional pre-fetched signed URL for an image (shown as its thumbnail). */
  thumbnailUrl?: string | null;
  /** Default true - show a download button alongside preview. */
  showDownload?: boolean;
  /** Signed-URL endpoint when the file is not a plain core document. */
  urlPath?: string;
  /**
   * `card` - file chip (profile document card style).
   * `compact` - icon + icon buttons, for table cells.
   * `thumbnail` - inline image only (falls back to `compact` for non-images).
   */
  variant?: 'card' | 'compact' | 'thumbnail';
  /** Thumbnail edge in px for the `thumbnail` variant. */
  thumbnailSize?: number;
  /** Appended to the card meta line (e.g. upload date). */
  metaExtra?: string;
  /** Extra card actions after preview / download (e.g. delete). */
  extraActions?: React.ReactNode;
}

function ImageThumbnail({
  src,
  alt,
  size,
  loading,
  label,
  onClick,
}: {
  src: string;
  alt: string;
  size: number;
  loading: boolean;
  label: string;
  onClick: () => void;
}): React.ReactNode {
  return (
    <Spin spinning={loading} size="small">
      <button
        type="button"
        className="inline-flex shrink-0 cursor-zoom-in overflow-hidden rounded-lg border-0 bg-transparent p-0"
        style={{ width: size, height: size }}
        aria-label={label}
        title={alt}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          preview={false}
          style={{
            objectFit: 'cover',
            borderRadius: 8,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        />
      </button>
    </Spin>
  );
}

/**
 * A stored file with click-to-preview: images open in the Ant Design
 * lightbox, PDFs in the browser's PDF viewer, other types download only.
 */
export default function DocumentPreview({
  documentId,
  fileName,
  fileType,
  fileSizeBytes,
  thumbnailUrl,
  showDownload = true,
  urlPath,
  variant = 'card',
  thumbnailSize = 40,
  metaExtra,
  extraActions,
}: DocumentPreviewProps): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <DocumentPreviewActions
      document={{
        id: documentId,
        name: fileName,
        fileType,
        fileSizeBytes,
        thumbnailUrl,
        urlPath,
      }}
    >
      {({ kind, canPreview, preview, previewLoading, download, downloading }) => {
        const previewLabel = t('common.previewFile', { name: fileName });
        const downloadLabel = t('common.downloadFile', { name: fileName });

        const thumbnail =
          kind === 'image' && thumbnailUrl ? (
            <ImageThumbnail
              src={thumbnailUrl}
              alt={fileName}
              size={variant === 'card' ? 44 : thumbnailSize}
              loading={previewLoading}
              label={previewLabel}
              onClick={preview}
            />
          ) : null;

        if (variant === 'thumbnail' && thumbnail) {
          return thumbnail;
        }

        const previewButton = canPreview ? (
          <Tooltip title={t('common.preview')}>
            <Button
              type="text"
              size="small"
              className="erp-profile-doc-card-action"
              icon={<Eye size={15} strokeWidth={1.75} />}
              loading={previewLoading}
              aria-label={previewLabel}
              onClick={(event) => {
                event.stopPropagation();
                preview();
              }}
            />
          </Tooltip>
        ) : null;

        const downloadButton = showDownload ? (
          <Tooltip title={t('common.download')}>
            <Button
              type="text"
              size="small"
              className="erp-profile-doc-card-action"
              icon={<Download size={15} strokeWidth={1.75} />}
              loading={downloading}
              aria-label={downloadLabel}
              onClick={(event) => {
                event.stopPropagation();
                download();
              }}
            />
          </Tooltip>
        ) : null;

        if (variant !== 'card') {
          return (
            <span className="inline-flex items-center gap-0.5">
              {thumbnail ?? (
                <Tooltip title={fileName}>
                  <span className="inline-flex shrink-0">
                    <ProfileFileTypeIcon
                      name={fileName}
                      fileType={fileType}
                      size="sm"
                    />
                  </span>
                </Tooltip>
              )}
              {previewButton}
              {downloadButton}
            </span>
          );
        }

        return (
          <article className="erp-profile-doc-card">
            <div className="erp-profile-doc-card-top">
              {thumbnail ?? (
                <ProfileFileTypeIcon name={fileName} fileType={fileType} />
              )}
              <div className="erp-profile-doc-card-actions">
                {previewButton}
                {downloadButton}
                {extraActions}
              </div>
            </div>
            <div className="erp-profile-doc-card-body">
              {canPreview ? (
                <button
                  type="button"
                  className="erp-profile-doc-card-name block w-full cursor-pointer border-0 bg-transparent p-0 text-left hover:underline"
                  title={fileName}
                  aria-label={previewLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    preview();
                  }}
                >
                  {fileName}
                </button>
              ) : (
                <p className="erp-profile-doc-card-name" title={fileName}>
                  {fileName}
                </p>
              )}
              <p className="erp-profile-doc-card-meta">
                {profileFileMetaLine(
                  fileName,
                  fileType,
                  fileSizeBytes ?? undefined,
                  metaExtra,
                ) || t('hr.labels.attachment')}
              </p>
            </div>
          </article>
        );
      }}
    </DocumentPreviewActions>
  );
}
