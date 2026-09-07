'use client';

import { useState } from 'react';
import { Button } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Shared PDF export button for HR detail pages.
 *
 * The caller supplies a `buildPdf` callback that renders the record with the
 * shared layout builder in `hr-document-pdf.ts`; this component owns the
 * loading state and success/error feedback.
 */
export default function ExportPdfButton({
  buildPdf,
  disabled = false,
  compact = false,
  className,
  label,
}: {
  buildPdf: () => void | Promise<void>;
  disabled?: boolean;
  /** Renders icon-only, for narrow toolbars. */
  compact?: boolean;
  className?: string;
  label?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [exporting, setExporting] = useState(false);

  const buttonLabel = label ?? t('hr.exportImport.exportPdf');

  async function handleClick(): Promise<void> {
    setExporting(true);
    try {
      await buildPdf();
      messageApi.success(t('hr.exportImport.exportPdfSuccess'));
    } catch {
      messageApi.error(t('hr.exportImport.exportPdfError'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      className={className}
      icon={<FilePdfOutlined />}
      loading={exporting}
      disabled={disabled}
      onClick={() => void handleClick()}
      aria-label={buttonLabel}
    >
      {compact ? undefined : buttonLabel}
    </Button>
  );
}
