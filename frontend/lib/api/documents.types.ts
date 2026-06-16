export interface InAppNotification {
  id: string;
  companyId: string;
  recipientId: string;
  subject: string;
  body: string;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadNotificationCount {
  count: number;
}

export interface DocumentRecord {
  id: string;
  folderId: string;
  companyId: string;
  name: string;
  fileKey: string;
  fileType: string;
  fileSizeBytes: number;
  version: number;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDownloadUrl {
  url: string;
  expiresIn: number;
}

export type EntityLinkType =
  | 'drawing'
  | 'rfi'
  | 'submittal'
  | 'issue'
  | 'punch_item';

export interface EntityLink {
  entityType: EntityLinkType;
  entityId: string;
  label: string;
}

export const ENTITY_LINK_TYPE_LABELS: Record<EntityLinkType, string> = {
  drawing: 'Drawing',
  rfi: 'RFI',
  submittal: 'Submittal',
  issue: 'Issue',
  punch_item: 'Punch Item',
};
