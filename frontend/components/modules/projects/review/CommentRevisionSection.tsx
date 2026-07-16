// UI polish pass - styles only, no logic changes

'use client';

import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type {
  CommentEdvSnapshot,
  ReviewCommentAttachment,
} from '@/lib/api/epc.types';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function CommentRevisionSection({
  commentedOn,
  responseRevision,
  responseAttachment,
  responseFiles,
  resolutionNote,
  resolvedAt,
  verifiedAt,
}: {
  commentedOn?: CommentEdvSnapshot;
  responseRevision?: CommentEdvSnapshot | null;
  responseAttachment?: ReviewCommentAttachment | null;
  responseFiles?: readonly {
    id: string;
    documentVersionId: string;
    fileName: string;
  }[];
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  verifiedAt?: string | null;
}): React.ReactNode {
  const additionalResponseFiles = responseFiles ?? [];

  /** Prefer explicit response attachment; fall back to EDV revision snapshot. */
  const primaryRevisedFile = responseAttachment
    ? {
        documentVersionId: responseAttachment.documentVersionId,
        name: responseAttachment.name,
      }
    : responseRevision
      ? {
          documentVersionId: responseRevision.documentVersionId,
          name: `${responseRevision.documentTitle} · Rev ${responseRevision.revisionLabel}`,
        }
      : null;

  const hasResolution =
    Boolean(primaryRevisedFile) ||
    additionalResponseFiles.length > 0 ||
    Boolean(resolutionNote?.trim()) ||
    Boolean(resolvedAt);

  if (!hasResolution && !commentedOn) {
    return null;
  }

  return (
    <div className="erp-drawer-response">
      <h4 className={layout.drawerHeading}>Designer response</h4>

      {commentedOn && (
        <div className="flex flex-col gap-2">
          <p className={layout.drawerMetaLabel}>Original document</p>
          <p className="text-[12px] text-[var(--color-text-primary)]">
            {commentedOn.documentTitle} · Rev {commentedOn.revisionLabel}
          </p>
        </div>
      )}

      {primaryRevisedFile ? (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-teal-600)]">
            Revised file
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {primaryRevisedFile.name}
            </p>
            <EdvFileActions
              compact
              documentVersionId={primaryRevisedFile.documentVersionId}
              fileName={primaryRevisedFile.name}
            />
          </div>
        </div>
      ) : resolvedAt ? (
        <p className={layout.drawerMutedText}>
          Marked resolved without a revised file on record.
        </p>
      ) : null}

      {additionalResponseFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-teal-600)]">
            Additional revised files
          </p>
          {additionalResponseFiles.map((file) => (
            <div
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                {file.fileName}
              </p>
              <EdvFileActions
                compact
                documentVersionId={file.documentVersionId}
                fileName={file.fileName}
              />
            </div>
          ))}
        </div>
      )}

      {resolutionNote?.trim() ? (
        <div>
          <p className={layout.drawerMetaLabel}>Resolution note</p>
          <p className={`mt-1 whitespace-pre-wrap text-[12px] text-[var(--color-text-primary)]`}>
            {resolutionNote}
          </p>
        </div>
      ) : null}

      {(resolvedAt || verifiedAt) && (
        <div className={`flex flex-wrap gap-4 ${layout.drawerMutedText}`}>
          {resolvedAt ? <span>Resolved: {formatProjectDate(resolvedAt)}</span> : null}
          {verifiedAt ? <span>Verified: {formatProjectDate(verifiedAt)}</span> : null}
        </div>
      )}
    </div>
  );
}
