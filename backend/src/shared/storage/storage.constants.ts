export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export const STORAGE_BUCKETS = {
  DOCUMENTS: 'erp-documents',
  DRAWINGS: 'erp-drawings',
  PHOTOS: 'erp-photos',
  HR: 'erp-hr',
  REPORTS: 'erp-reports',
} as const;

export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/octet-stream',
  'application/acad',
  'application/x-autocad',
  'image/vnd.dwg',
  'image/x-dwg',
  'application/dxf',
  'application/x-dxf',
  'application/x-step',
  'application/x-iges',
  'application/vnd.ms-project',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/gzip',
]);
