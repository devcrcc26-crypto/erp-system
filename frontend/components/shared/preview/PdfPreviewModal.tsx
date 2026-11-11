'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button, Modal, Spin, Tooltip } from 'antd';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { profileFileMetaLine } from '@/components/modules/users/ProfileFileTypeIcon';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  signedUrl: string;
  fileName: string;
  fileSizeBytes?: number | null;
  /** Download through the app (fresh URL); defaults to the preview URL. */
  onDownload?: () => void;
  downloading?: boolean;
}

const noopSubscribe = (): (() => void) => () => undefined;

/**
 * `navigator.pdfViewerEnabled` is false where the browser has no inline PDF
 * viewer (e.g. Android Chrome); older browsers without the flag are assumed
 * to render PDFs.
 */
function browserCanRenderPdf(): boolean {
  return (
    (navigator as Navigator & { pdfViewerEnabled?: boolean })
      .pdfViewerEnabled !== false
  );
}

/** PDF badge in the app's red file-type palette (see seal-file-display). */
const PDF_ACCENT = '#DC2626';
const PDF_SOFT = '#FEF2F2';

/**
 * PDF viewer modal using the browser's native PDF renderer in an iframe.
 */
export default function PdfPreviewModal({
  open,
  onClose,
  signedUrl,
  fileName,
  fileSizeBytes,
  onDownload,
  downloading = false,
}: PdfPreviewModalProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const canRender = useSyncExternalStore(
    noopSubscribe,
    browserCanRenderPdf,
    () => true,
  );
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const frameLoading = canRender && loadedUrl !== signedUrl;
  const meta = profileFileMetaLine(fileName, 'application/pdf', fileSizeBytes ?? undefined);

  const downloadButtonProps = onDownload
    ? { onClick: onDownload, loading: downloading }
    : {
        href: signedUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        download: fileName,
      };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      closable={false}
      width={900}
      centered
      destroyOnHidden
      afterOpenChange={(isOpen) => {
        if (!isOpen) {
          setLoadedUrl(null);
        }
      }}
      styles={{
        container: {
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)',
        },
        body: { padding: 0 },
      }}
    >
      <header className="flex items-center gap-3 border-b border-[#eef1f4] bg-white px-4 py-3 sm:px-5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: PDF_SOFT, color: PDF_ACCENT }}
          aria-hidden
        >
          <FileText size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="m-0 truncate text-[15px] font-semibold leading-tight text-slate-900"
            title={fileName}
          >
            {fileName}
          </h3>
          {meta ? (
            <p className="m-0 mt-0.5 text-xs text-slate-500">{meta}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip title={t('common.openInNewTab')}>
            <Button
              type="text"
              icon={<ExternalLink size={16} strokeWidth={1.75} />}
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('common.openInNewTab')}
              className="!text-slate-500 hover:!text-slate-900"
            />
          </Tooltip>
          <Button
            icon={<Download size={15} strokeWidth={1.75} />}
            aria-label={t('common.downloadFile', { name: fileName })}
            className="!rounded-lg !font-medium"
            {...downloadButtonProps}
          >
            <span className="hidden sm:inline">{t('common.download')}</span>
          </Button>
          <span className="mx-1 h-6 w-px bg-[#e8ebef]" aria-hidden />
          <Tooltip title={t('common.closePreview')}>
            <Button
              type="text"
              icon={<X size={18} strokeWidth={1.75} />}
              onClick={onClose}
              aria-label={t('common.closePreview')}
              className="!text-slate-500 hover:!text-slate-900"
            />
          </Tooltip>
        </div>
      </header>

      <div
        className="bg-slate-100 p-2 sm:p-3"
        style={{ height: 'min(80vh, calc(100dvh - 120px))' }}
      >
        {canRender ? (
          <div className="relative h-full overflow-hidden rounded-[10px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            {frameLoading ? (
              <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white">
                <Spin size="large" />
              </div>
            ) : null}
            <iframe
              key={signedUrl}
              src={signedUrl}
              title={fileName}
              className="block h-full w-full border-0"
              onLoad={() => setLoadedUrl(signedUrl)}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-sm flex-col items-center gap-4 rounded-[14px] border border-[#e8ebef] bg-white px-8 py-10 text-center shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
              <span
                className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px]"
                style={{ background: PDF_SOFT, color: PDF_ACCENT }}
                aria-hidden
              >
                <FileText size={24} strokeWidth={1.6} />
              </span>
              <p className="m-0 text-sm leading-relaxed text-slate-600">
                {t('common.pdfPreviewUnsupported')}
              </p>
              <Button
                type="primary"
                icon={<Download size={15} />}
                className="!h-9 !rounded-lg !font-semibold"
                {...downloadButtonProps}
              >
                {t('common.downloadToView')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
