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
  'application/dwg',
  'application/vnd.dwg',
  'application/x-dwg',
  'image/vnd.dwg',
  'image/x-dwg',
  'application/dxf',
  'application/x-dxf',
  'application/dwf',
  'application/x-dwf',
  'application/dgn',
  'application/x-dgn',
  'application/drw',
  'application/x-drw',
  'application/vnd.autodesk.revit',
  'application/ifc',
  'model/ifc',
  'model/step',
  'model/iges',
  'application/x-step',
  'application/x-iges',
  'application/vnd.ms-project',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/gzip',
]);

/** Image-only uploads (item photos, profile pictures, etc.). */
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
