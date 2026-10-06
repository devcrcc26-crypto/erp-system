import type { PaginationMeta } from '@/lib/api/types';

export type AnnouncementType = 'COMPANY' | 'SYSTEM_UPDATE';
export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT';
export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type AnnouncementScope = 'ALL' | 'DEPARTMENTS' | 'DISCIPLINES' | 'ROLES' | 'EMPLOYEES';

export interface AnnouncementPerson {
  id: string;
  firstName: string;
  lastName: string;
  chineseName: string | null;
  employeeId: string | null;
}

export interface AnnouncementAttachment {
  id: string;
  name: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface AnnouncementStats {
  recipients: number;
  read: number;
  acknowledged: number;
}

/** A received announcement as listed for the signed-in user. */
export interface MyAnnouncementSummary {
  id: string;
  number: string;
  type: AnnouncementType;
  title: string;
  titleZh: string | null;
  excerpt: string;
  excerptZh: string | null;
  priority: AnnouncementPriority;
  pinned: boolean;
  requireAcknowledgement: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  contentEditedAt: string | null;
  isExpired: boolean;
  author: AnnouncementPerson | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export interface MyAnnouncementDetail extends MyAnnouncementSummary {
  body: string;
  bodyZh: string | null;
  attachments: AnnouncementAttachment[];
}

export interface AnnouncementsSummary {
  unreadCount: number;
  urgent: MyAnnouncementSummary[];
  pendingAcknowledgement: MyAnnouncementDetail[];
  whatsNew: MyAnnouncementDetail[];
  latest: MyAnnouncementSummary[];
}

export interface ManagedAnnouncementListItem {
  id: string;
  number: string;
  type: AnnouncementType;
  title: string;
  titleZh: string | null;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceScope: AnnouncementScope;
  audienceSize: number;
  requireAcknowledgement: boolean;
  sendEmail: boolean;
  pinned: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: AnnouncementPerson | null;
  stats: AnnouncementStats;
}

export interface ManagedAnnouncementDetail {
  id: string;
  number: string;
  type: AnnouncementType;
  title: string;
  titleZh: string | null;
  body: string;
  bodyZh: string | null;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceScope: AnnouncementScope;
  departmentIds: string[];
  disciplineIds: string[];
  roleIds: string[];
  employeeIds: string[];
  requireAcknowledgement: boolean;
  sendEmail: boolean;
  pinned: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  contentEditedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: AnnouncementPerson | null;
  attachments: AnnouncementAttachment[];
  audienceLabels: string[];
  stats: AnnouncementStats;
  /** Present on the update response: acknowledgements cleared by a message edit. */
  acknowledgementsReset?: number;
  permissions: {
    canEdit: boolean;
    canPublish: boolean;
    canArchive: boolean;
    canDelete: boolean;
    canExport: boolean;
    canRemind: boolean;
  };
}

export interface AnnouncementRecipientRow {
  id: string;
  user: AnnouncementPerson & {
    department: { id: string; name: string; nameZh: string | null } | null;
  };
  readAt: string | null;
  acknowledgedAt: string | null;
}

export interface AnnouncementAudienceOptions {
  departments: Array<{ id: string; name: string; nameZh: string | null }>;
  disciplines: Array<{ id: string; name: string; nameZh: string | null }>;
  roles: Array<{ id: string; name: string }>;
  employees: Array<AnnouncementPerson & { department: { id: string; name: string } | null }>;
}

export interface AnnouncementAudienceInput {
  audienceScope: AnnouncementScope;
  departmentIds?: string[];
  disciplineIds?: string[];
  roleIds?: string[];
  employeeIds?: string[];
}

export interface AnnouncementWritePayload extends Partial<AnnouncementAudienceInput> {
  type?: AnnouncementType;
  title?: string;
  titleZh?: string | null;
  body?: string;
  bodyZh?: string | null;
  priority?: AnnouncementPriority;
  requireAcknowledgement?: boolean;
  sendEmail?: boolean;
  pinned?: boolean;
  expiresAt?: string | null;
}

export interface ListManagedAnnouncementsParams {
  page?: number;
  limit?: number;
  status?: AnnouncementStatus;
  type?: AnnouncementType;
  search?: string;
}

export interface ListMyAnnouncementsParams {
  page?: number;
  limit?: number;
  filter?: 'all' | 'unread';
  type?: AnnouncementType;
}

export interface ListRecipientsParams {
  page?: number;
  limit?: number;
  filter?: 'all' | 'unread' | 'unacknowledged';
  search?: string;
}

export type Paginated<T> = { data: T[]; meta: PaginationMeta };
