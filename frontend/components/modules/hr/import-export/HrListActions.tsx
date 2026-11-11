'use client';

import { Button, Dropdown, Space } from 'antd';
import {
  DownloadOutlined,
  MoreOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ItemType } from 'antd/es/menu/interface';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useHrExcelExport,
  type HrExcelExportAction,
} from '@/components/modules/hr/import-export/use-hr-excel-export';

export interface HrListPrimaryAction {
  label: string;
  onClick: () => void;
  /** Defaults to a plus sign. */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Docs-capture hook — opens a modal/dialog worth screenshotting. */
  dataShot?: string;
}

/**
 * The shared HR list-page action cluster: export, import and the page's
 * primary button.
 *
 * On a wide toolbar they render as one joined `Space.Compact` group - an
 * export dropdown, an import button, then the primary button. On a narrow
 * toolbar the export and import actions collapse into a single overflow menu
 * and the primary button becomes icon-only.
 */
export default function HrListActions({
  compact,
  exports = [],
  onImport,
  primary,
  extra,
  extraMenuItems = [],
}: {
  /** True on narrow toolbars - pass the page's `isCompact`. */
  compact: boolean;
  exports?: HrExcelExportAction[];
  /** Omit to hide the import button (no permission, or no importer). */
  onImport?: () => void;
  /** The page's own "New …" button. */
  primary?: HrListPrimaryAction;
  /** Extra buttons rendered before the primary one on a wide toolbar. */
  extra?: React.ReactNode;
  /** Matching entries for the narrow overflow menu. */
  extraMenuItems?: ItemType[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const { exporting, runExport } = useHrExcelExport();

  const exportLabel = t('hr.exportImport.exportExcel');
  const importLabel = t('hr.exportImport.importFromExcel');

  const exportMenuItems: ItemType[] = exports.map((action) => ({
    key: action.key,
    icon: <DownloadOutlined />,
    label: action.label ?? exportLabel,
    disabled: exporting || action.disabled,
    onClick: () => void runExport(action),
  }));

  if (compact) {
    const menuItems: ItemType[] = [
      ...exportMenuItems,
      ...(onImport
        ? [
            {
              key: 'import',
              icon: <UploadOutlined />,
              label: importLabel,
              onClick: onImport,
            },
          ]
        : []),
      ...extraMenuItems,
    ];

    return (
      <>
        {menuItems.length > 0 ? (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button icon={<MoreOutlined />} aria-label={t('common.actions')} />
          </Dropdown>
        ) : null}
        {primary ? (
          <Button
            type="primary"
            icon={primary.icon ?? <PlusOutlined />}
            onClick={primary.onClick}
            disabled={primary.disabled}
            aria-label={primary.label}
            data-shot={primary.dataShot}
          />
        ) : null}
      </>
    );
  }

  return (
    <Space.Compact>
      {exports.length > 1 ? (
        <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
          <Button icon={<DownloadOutlined />} loading={exporting}>
            {exportLabel}
          </Button>
        </Dropdown>
      ) : exports.length === 1 ? (
        <Button
          icon={<DownloadOutlined />}
          loading={exporting}
          disabled={exports[0].disabled}
          onClick={() => void runExport(exports[0])}
        >
          {exports[0].label ?? exportLabel}
        </Button>
      ) : null}
      {onImport ? (
        <Button
          icon={<UploadOutlined />}
          onClick={onImport}
          data-shot="hr-import"
        >
          {importLabel}
        </Button>
      ) : null}
      {extra}
      {primary ? (
        <Button
          type="primary"
          icon={primary.icon ?? <PlusOutlined />}
          onClick={primary.onClick}
          disabled={primary.disabled}
          data-shot={primary.dataShot}
        >
          {primary.label}
        </Button>
      ) : null}
    </Space.Compact>
  );
}
