'use client';

import { Button, Dropdown } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ItemType } from 'antd/es/menu/interface';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useHrExcelExport,
  type HrExcelExportAction,
} from '@/components/modules/hr/import-export/use-hr-excel-export';

export type { HrExcelExportAction };

/**
 * Standalone Excel export button for HR pages whose toolbar has no primary
 * action to group with. Pages with a "New …" button should use
 * `HrListActions`, which lays export, import and that button out together.
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
  const { exporting, runExport } = useHrExcelExport();

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
