import { ALLOWED_UPLOAD_MIME_TYPES } from './storage.constants';

/** Extensions allowed when MIME is generic (common for CAD files on Windows). */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'zip',
  '7z',
  'rar',
  'gz',
  'dwg',
  'dxf',
  'dwf',
  'dgn',
  'drw',
  'rvt',
  'rfa',
  'ifc',
  'stp',
  'step',
  'igs',
  'iges',
]);

const EXTENSION_FALLBACK_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

function extractExtension(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Validates upload MIME type, with extension fallback for CAD/drawing files
 * that browsers and Windows often send as application/octet-stream.
 */
export function isAllowedUploadFile(file: {
  mimetype: string;
  originalname: string;
}): boolean {
  const mimetype = file.mimetype?.trim().toLowerCase() ?? '';
  if (ALLOWED_UPLOAD_MIME_TYPES.has(mimetype)) {
    return true;
  }
  if (!EXTENSION_FALLBACK_MIMES.has(mimetype)) {
    return false;
  }
  const extension = extractExtension(file.originalname);
  return extension.length > 0 && ALLOWED_UPLOAD_EXTENSIONS.has(extension);
}

/**
 * Throws-friendly check used by upload handlers.
 */
export function assertAllowedUploadFile(file: {
  mimetype: string;
  originalname: string;
}): void {
  if (!isAllowedUploadFile(file)) {
    throw new Error(`File type not allowed: ${file.mimetype || 'unknown'}`);
  }
}
