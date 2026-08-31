import { createElement, type ReactNode } from 'react';
import {
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  FieldTimeOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import type { InAppNotification } from '@/lib/api/documents.types';
import { tokens } from '@/lib/theme/tokens';

export interface NotificationVisual {
  icon: ReactNode;
  bg: string;
  color: string;
}

/** Maps a notification to a category icon and color for inbox UI. */
export function notificationVisual(
  notification: InAppNotification,
): NotificationVisual {
  const link = notification.link?.toLowerCase() ?? '';
  const subject = notification.subject.toLowerCase();

  if (link.includes('/leave') || subject.includes('leave')) {
    return {
      icon: createElement(CalendarOutlined),
      bg: tokens.colorTeal50,
      color: tokens.colorTeal400,
    };
  }
  if (link.includes('/overtime') || subject.includes('overtime')) {
    return {
      icon: createElement(FieldTimeOutlined),
      bg: tokens.colorBlue50,
      color: tokens.colorBlue400,
    };
  }
  if (
    link.includes('/approval') ||
    subject.includes('approv') ||
    subject.includes('reject')
  ) {
    return {
      icon: createElement(CheckCircleOutlined),
      bg: tokens.colorAmber50,
      color: tokens.colorAmber400,
    };
  }
  if (link.includes('/project')) {
    return {
      icon: createElement(ProjectOutlined),
      bg: tokens.colorBlue50,
      color: tokens.colorBlue400,
    };
  }
  return {
    icon: createElement(BellOutlined),
    bg: tokens.colorGray50,
    color: tokens.colorGray600,
  };
}
