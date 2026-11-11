import { apiGet } from '@/lib/api/client';

interface DocumentDownloadResponse {
  url: string;
  expiresIn: number;
}

/**
 * Resolves a presigned URL for a core document version (linked from an EDV).
 */
export async function getDocumentVersionDownloadUrl(
  documentVersionId: string,
): Promise<string> {
  const { url } = await apiGet<DocumentDownloadResponse>(
    `/documents/versions/${documentVersionId}/download-url`,
  );
  return url;
}

/**
 * Opens the document version file in a new browser tab (view / preview).
 */
export async function openDocumentVersion(documentVersionId: string): Promise<void> {
  const url = await getDocumentVersionDownloadUrl(documentVersionId);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Triggers download of the document version file.
 */
export async function downloadDocumentVersion(
  documentVersionId: string,
  fileName?: string,
): Promise<void> {
  const url = await getDocumentVersionDownloadUrl(documentVersionId);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Triggers download of a core document (review session attachment).
 */
export async function downloadDocument(
  documentId: string,
  fileName?: string,
): Promise<void> {
  const { url } = await apiGet<DocumentDownloadResponse>(
    `/documents/${documentId}/download-url`,
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Starts a browser download for an already-resolved (presigned) URL.
 */
export function triggerUrlDownload(url: string, fileName?: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
