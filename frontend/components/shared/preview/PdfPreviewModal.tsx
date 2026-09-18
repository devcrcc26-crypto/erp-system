'use client';

import { useSyncExternalStore } from 'react';
import { Button, Modal, Typography } from 'antd';
import { Download, FileText } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

export interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  signedUrl: string;
  fileName: string;
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

/**
 * PDF viewer modal using the browser's native PDF renderer in an iframe.
 */
export default function PdfPreviewModal({
  open,
  onClose,
  signedUrl,
  fileName,
}: PdfPreviewModalProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const canRender = useSyncExternalStore(
    noopSubscribe,
    browserCanRenderPdf,
    () => true,
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      centered
      destroyOnHidden
      title={
        <span className="block truncate pr-8" title={fileName}>
          {fileName}
        </span>
      }
      styles={{ body: { height: '80vh', padding: 0 } }}
    >
      {canRender ? (
        <iframe
          src={signedUrl}
          title={fileName}
          className="block h-full w-full rounded-md border-0"
          style={{ background: tokens.colorPageBg }}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <FileText
            size={40}
            strokeWidth={1.5}
            style={{ color: tokens.colorTextTertiary }}
            aria-hidden
          />
          <Typography.Text type="secondary">
            {t('common.pdfPreviewUnsupported')}
          </Typography.Text>
          <Button
            type="primary"
            icon={<Download size={14} />}
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName}
          >
            {t('common.downloadToView')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
