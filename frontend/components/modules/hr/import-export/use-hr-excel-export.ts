'use client';

import { useCallback, useState } from 'react';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  buildHrExportFileName,
  downloadHrExcelWorkbook,
} from '@/lib/utils/hr-export-excel';
import { useAuthStore } from '@/stores/auth.store';

/** One entry in a list page's export menu. */
export interface HrExcelExportAction {
  key: string;
  /** Menu/button label. Defaults to the shared "Export Excel" wording. */
  label?: string;
  /** File name prefix; the company and date are appended. */
  filePrefix: string;
  /**
   * Builds the workbook contents from whatever is currently on screen. Called
   * at click time so the export always reflects the active filters, and may be
   * async when a sheet needs extra detail fetched first.
   */
  buildSheets: () => HrExportSheet[] | Promise<HrExportSheet[]>;
  disabled?: boolean;
}

/**
 * Runs HR list exports: builds the workbook, names the file after the company
 * and today's date, downloads it, and reports success or failure.
 */
export function useHrExcelExport(): {
  exporting: boolean;
  runExport: (action: HrExcelExportAction) => Promise<void>;
} {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const companyName = useAuthStore((state) => state.user?.companyName);
  const [exporting, setExporting] = useState(false);

  const runExport = useCallback(
    async (action: HrExcelExportAction): Promise<void> => {
      setExporting(true);
      try {
        const sheets = await action.buildSheets();
        await downloadHrExcelWorkbook({
          fileName: buildHrExportFileName(
            action.filePrefix,
            companyName ?? 'CRCC International Consulting',
          ),
          sheets,
        });
        messageApi.success(t('hr.exportImport.exportSuccess'));
      } catch {
        messageApi.error(t('hr.exportImport.exportError'));
      } finally {
        setExporting(false);
      }
    },
    [companyName, messageApi, t],
  );

  return { exporting, runExport };
}
