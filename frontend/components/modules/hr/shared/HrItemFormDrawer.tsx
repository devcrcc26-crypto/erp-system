'use client';

import { Button, Drawer } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { detailDrawerStyles } from '@/lib/theme/layout';
import './hr-item-drawer.css';

/**
 * Side drawer for add/edit line items on HR requisition create forms (overtime pattern).
 */
export default function HrItemFormDrawer({
  open,
  onClose,
  editing,
  title,
  hint,
  onSave,
  children,
  drawerClassName,
  saveLabel,
}: {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  title: string;
  hint?: string;
  onSave: () => void | Promise<void>;
  children: React.ReactNode;
  drawerClassName?: string;
  saveLabel?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const drawerClasses = [
    'erp-responsive-drawer',
    'erp-hr-item-drawer',
    'erp-expense-item-drawer',
    drawerClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Drawer
      open={open}
      title={
        <div className="min-w-0 py-1">
          <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
            {title}
          </div>
        </div>
      }
      size={520}
      className={drawerClasses}
      styles={detailDrawerStyles}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="erp-hr-item-drawer-footer erp-expense-item-drawer-footer">
          <Button onClick={onClose}>{t('hr.buttons.cancel')}</Button>
          <Button type="primary" onClick={() => void onSave()}>
            {saveLabel ??
              (editing ? t('common.save') : t('hr.buttons.addItem'))}
          </Button>
        </div>
      }
    >
      <div className="erp-hr-item-drawer-body">
        {hint ? (
          <div className="erp-hr-item-drawer-hint-card" role="note">
            {hint}
          </div>
        ) : null}
        {children}
      </div>
    </Drawer>
  );
}
