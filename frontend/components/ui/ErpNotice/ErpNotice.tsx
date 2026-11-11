'use client';

import { Button } from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export type ErpNoticeTone = 'info' | 'warning' | 'error' | 'success';

const TONE_ICON: Record<ErpNoticeTone, ReactNode> = {
  info: <InfoCircleOutlined />,
  warning: <WarningOutlined />,
  error: <ExclamationCircleOutlined />,
  success: <CheckCircleOutlined />,
};

/**
 * Users-chrome inline notice - guidance, warnings, and recoverable errors.
 */
export default function ErpNotice({
  tone = 'info',
  title,
  description,
  action,
  closable = false,
  onClose,
  closeLabel = 'Dismiss',
  className = '',
}: {
  tone?: ErpNoticeTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  closable?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}): React.ReactNode {
  return (
    <div
      className={`erp-notice erp-notice--${tone}${className ? ` ${className}` : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="erp-notice-chip" aria-hidden>
        {TONE_ICON[tone]}
      </span>
      <div className="erp-notice-body min-w-0 flex-1">
        <p className="erp-notice-title">{title}</p>
        {description ? (
          <div className="erp-notice-description">{description}</div>
        ) : null}
        {action ? <div className="erp-notice-action">{action}</div> : null}
      </div>
      {closable ? (
        <Button
          type="text"
          size="small"
          className="erp-notice-close"
          icon={<CloseOutlined />}
          onClick={onClose}
          aria-label={closeLabel}
        />
      ) : null}
    </div>
  );
}
