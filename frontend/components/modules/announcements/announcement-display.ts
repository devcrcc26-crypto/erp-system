import type { CSSProperties } from 'react';
import dayjs from 'dayjs';
import type {
  AnnouncementPerson,
  AnnouncementPriority,
  AnnouncementScope,
  AnnouncementStatus,
} from '@/lib/api/announcements.types';
import type { EpcLocale } from '@/lib/i18n/epc-messages';
import { formatUserName } from '@/lib/utils/user-display';

/** Chinese title / body when the user reads Chinese and the post has one. */
export function localized(
  locale: EpcLocale,
  english: string,
  chinese: string | null | undefined,
): string {
  return locale === 'zh' && chinese?.trim() ? chinese : english;
}

export function formatAnnouncementDate(value: string | null | undefined): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

export function formatAnnouncementDay(value: string | null | undefined): string {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

export function personName(person: AnnouncementPerson | null | undefined): string {
  return person ? formatUserName(person) : '-';
}

export function priorityLabelKey(priority: AnnouncementPriority): string {
  return `announcements.priority.${priority}`;
}

export function statusLabelKey(status: AnnouncementStatus): string {
  return `announcements.status.${status}`;
}

export function scopeLabelKey(scope: AnnouncementScope): string {
  return `announcements.scope.${scope}`;
}

/** Tag colours; every text colour is at least 4.5:1 on its background. */
export function priorityTagStyle(priority: AnnouncementPriority): CSSProperties {
  switch (priority) {
    case 'URGENT':
      return { color: '#B42318', background: '#FEF3F2' };
    case 'IMPORTANT':
      return { color: '#B54708', background: '#FFFAEB' };
    default:
      return { color: '#344054', background: '#F2F4F7' };
  }
}

export function statusTagStyle(status: AnnouncementStatus): CSSProperties {
  switch (status) {
    case 'PUBLISHED':
      return { color: '#067647', background: '#ECFDF3' };
    case 'SCHEDULED':
      return { color: '#1A4A7A', background: '#EEF5FC' };
    case 'ARCHIVED':
      return { color: '#475467', background: '#F2F4F7' };
    default:
      return { color: '#344054', background: '#F2F4F7' };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
