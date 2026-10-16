'use client';

import { Button, Modal } from 'antd';
import type { ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export type ConfirmDialogTone = 'default' | 'success' | 'warning' | 'danger';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmLoading = false,
  confirmDisabled = false,
  danger = false,
  tone,
  icon,
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
  /** Visual tone for the icon chip. Defaults from `danger`. */
  tone?: ConfirmDialogTone;
  /** Override the default icon. */
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  /** Extra class on the modal root, e.g. `erp-approval-modal` for the v2 look. */
  className?: string;
}): React.ReactNode {
  const resolvedTone: ConfirmDialogTone =
    tone ?? (danger ? 'danger' : 'default');
  const hasForm = Boolean(children);
  const rootClassName = [
    'erp-confirm-dialog',
    hasForm ? 'erp-confirm-dialog--form' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      onCancel={onCancel}
      centered
      // Dialogs with inputs (e.g. an approval note) need room to write; plain confirms stay compact.
      width={hasForm ? 560 : 420}
      rootClassName={rootClassName}
      className={rootClassName}
      classNames={{
        content: 'erp-confirm-dialog-content',
      }}
      styles={{
        content: {
          borderRadius: 16,
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
          className={`erp-confirm-dialog-icon erp-confirm-dialog-icon--${resolvedTone}`}
          aria-hidden
        >
          {icon ??
            (resolvedTone === 'danger' ? (
              <Trash2 size={22} strokeWidth={1.75} />
            ) : (
              <AlertTriangle size={22} strokeWidth={1.75} />
            ))}
        </div>

        <div className="erp-confirm-dialog-copy">
          <h3 className="erp-confirm-dialog-title">{title}</h3>
          {description ? (
            <div className="erp-confirm-dialog-description">{description}</div>
          ) : null}
          {children ? (
            <div className="erp-confirm-dialog-fields">{children}</div>
          ) : null}
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
            danger={danger || resolvedTone === 'danger'}
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
