'use client';

import { createContext, useContext } from 'react';

/** A stored file that may be previewed and/or downloaded. */
export interface PreviewDocument {
  /** Core document id (or the entity-scoped id `urlPath` resolves). */
  id: string;
  name: string;
  /** MIME type, e.g. `image/jpeg` or `application/pdf`. */
  fileType?: string | null;
  fileSizeBytes?: number | null;
  /** Already-loaded signed URL for an image (skips the on-click fetch). */
  thumbnailUrl?: string | null;
  /**
   * Endpoint returning `{ url, expiresIn }` for this file. Defaults to
   * `/documents/:id/download-url`; set it for profile documents and photos.
   */
  urlPath?: string;
}

export type PreviewKind = 'image' | 'pdf' | 'none';

const PREVIEWABLE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

/**
 * Images the browser can show (JPG, PNG, WebP, GIF) open in the lightbox,
 * PDFs open in the PDF modal, everything else is download-only. The file
 * extension is only consulted when the MIME type is missing or generic.
 */
export function resolvePreviewKind(
  fileType: string | null | undefined,
  fileName: string,
): PreviewKind {
  const mime = (fileType ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  if (PREVIEWABLE_IMAGE_MIME_TYPES.has(mime)) {
    return 'image';
  }
  if (mime && mime !== 'application/octet-stream') {
    return 'none';
  }
  const extension = fileName.includes('.')
    ? (fileName.split('.').pop() ?? '').toLowerCase()
    : '';
  if (extension === 'pdf') {
    return 'pdf';
  }
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(extension) ? 'image' : 'none';
}

export interface PreviewGroupContextValue {
  /** True when this group (or an enclosing one) can show the image in its lightbox. */
  hasImage: (documentId: string) => boolean;
  /** Opens the group lightbox at this image; `knownUrl` avoids a refetch. */
  openImage: (documentId: string, knownUrl?: string | null) => void;
  /** Image whose signed URL is loading because the user just opened it. */
  loadingId: string | null;
}

export const PreviewGroupContext =
  createContext<PreviewGroupContextValue | null>(null);

export function usePreviewGroup(): PreviewGroupContextValue | null {
  return useContext(PreviewGroupContext);
}
