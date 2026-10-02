'use client';

import { Button, Modal } from 'antd';
import type { ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmLoading = false,
  confirmDisabled = false,
  danger = false,
  onConfirm,
  onCancel,
  children,
  className,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  /** Extra class on the modal root, e.g. `erp-confirm-dialog--v2` for the v2 look. */
  className?: string;
}): React.ReactNode {
  const rootClassName = className ? `erp-confirm-dialog ${className}` : 'erp-confirm-dialog';
  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      onCancel={onCancel}
      centered
      // Dialogs with inputs (e.g. an approval note) need room to write; plain confirms stay compact.
      width={children ? 560 : 420}
      rootClassName={rootClassName}
      className={rootClassName}
      classNames={{
        content: 'erp-confirm-dialog-content',
      }}
      styles={{
        content: {
          borderRadius: 14,
          overflow: 'hidden',
          padding: 0,
        },
      }}
      destroyOnHidden
      closable={!confirmLoading}
      mask={{ closable: !confirmLoading }}
    >
      <div className="erp-confirm-dialog-body">
        <div
          className={`erp-confirm-dialog-icon${danger ? ' erp-confirm-dialog-icon--danger' : ''}`}
          aria-hidden
        >
          {danger ? (
            <Trash2 size={22} strokeWidth={1.75} />
          ) : (
            <AlertTriangle size={22} strokeWidth={1.75} />
          )}
        </div>

        <div className="erp-confirm-dialog-copy">
          <h3 className="erp-confirm-dialog-title">{title}</h3>
          {description ? (
            <div className="erp-confirm-dialog-description">{description}</div>
          ) : null}
          {children}
        </div>

        <div className="erp-confirm-dialog-actions">
          <Button
            onClick={onCancel}
            disabled={confirmLoading}
            className="erp-confirm-dialog-btn"
          >
            {cancelLabel}
          </Button>
          <Button
            type="primary"
            danger={danger}
            loading={confirmLoading}
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="erp-confirm-dialog-btn"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
