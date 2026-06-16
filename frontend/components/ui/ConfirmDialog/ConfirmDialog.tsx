'use client';

import { Modal } from 'antd';
import type { ReactNode } from 'react';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmLoading = false,
  danger = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmLoading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}): React.ReactNode {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={confirmLabel}
      cancelText={cancelLabel}
      confirmLoading={confirmLoading}
      okButtonProps={{ danger }}
      destroyOnHidden
    >
      {description && <p className="text-sm text-slate-600">{description}</p>}
      {children}
    </Modal>
  );
}
