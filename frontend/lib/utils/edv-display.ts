import type { EngineeringDocument } from '@/lib/api/epc.types';

type SnapshotEdv = {
  id: string;
  engineeringDocumentName: string;
  revisionLabel: string;
};

/**
 * Resolves an engineering document version id to a human-readable label.
 */
export function resolveEdvDisplayLabel(
  edvId: string,
  documents: readonly EngineeringDocument[],
  snapshotEdvs?: readonly SnapshotEdv[],
): string {
  for (const doc of documents) {
    for (const version of doc.versions ?? []) {
      if (version.id === edvId) {
        const title = doc.title?.trim() || doc.documentNumber?.trim() || 'Document';
        return `${title} · Rev ${version.revisionLabel}`;
      }
    }
  }

  const snapshot = snapshotEdvs?.find((row) => row.id === edvId);
  if (snapshot) {
    const title = snapshot.engineeringDocumentName?.trim() || 'Document';
    return `${title} · Rev ${snapshot.revisionLabel}`;
  }

  return 'Engineering document';
}
