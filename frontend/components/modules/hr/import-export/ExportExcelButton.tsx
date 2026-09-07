'use client';

import { useCallback, useState } from 'react';
import { Button, Dropdown } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ItemType } from 'antd/es/menu/interface';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  buildHrExportFileName,
  downloadHrExcelWorkbook,
} from '@/lib/utils/hr-export-excel';
import { useAuthStore } from '@/stores/auth.store';

/** One entry in the export dropdown, or the single export when alone. */
export interface HrExcelExportAction {
  key: string;
  /** Button/menu label. Defaults to the shared "Export Excel" wording. */
  label?: string;
  /** File name prefix; the company and date are appended. */
  filePrefix: string;
  /**
   * Builds the workbook contents from whatever is currently on screen. Called
   * at click time so the export always reflects the active filters.
   */
  buildSheets: () => HrExportSheet[] | Promise<HrExportSheet[]>;
  disabled?: boolean;
}

/**
 * Shared Excel export button for HR list pages.
 *
 * The caller passes actions that build their sheets from the already-filtered
 * rows, so the file matches exactly what the list is showing. With more than
 * one action the button becomes a dropdown.
 */
export default function ExportExcelButton({
  actions,
  compact = false,
  className,
}: {
  actions: HrExcelExportAction[];
  /** Renders icon-only, for narrow toolbars. */
  compact?: boolean;
  className?: string;
}): React.ReactNode {
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

  const defaultLabel = t('hr.exportImport.exportExcel');

  if (actions.length === 0) {
    return null;
  }

  if (actions.length === 1) {
    const action = actions[0];
    return (
      <Button
        className={className}
        icon={<DownloadOutlined />}
        loading={exporting}
        disabled={action.disabled}
        onClick={() => void runExport(action)}
        aria-label={action.label ?? defaultLabel}
      >
        {compact ? undefined : (action.label ?? defaultLabel)}
      </Button>
    );
  }

  const items: ItemType[] = actions.map((action) => ({
    key: action.key,
    icon: <DownloadOutlined />,
    label: action.label ?? defaultLabel,
    disabled: exporting || action.disabled,
    onClick: () => void runExport(action),
  }));

  return (
    <Dropdown menu={{ items }} trigger={['click']}>
      <Button
        className={className}
        icon={<DownloadOutlined />}
        loading={exporting}
        aria-label={defaultLabel}
      >
        {compact ? undefined : defaultLabel}
      </Button>
    </Dropdown>
  );
}
