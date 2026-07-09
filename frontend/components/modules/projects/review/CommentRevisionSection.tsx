// UI polish pass - styles only, no logic changes

'use client';

import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { CommentEdvSnapshot, ReviewCommentAttachment } from '@/lib/api/epc.types';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function CommentRevisionSection({
  commentedOn,
  responseRevision,
  responseAttachment,
  resolutionNote,
  resolvedAt,
  verifiedAt,
}: {
  commentedOn?: CommentEdvSnapshot;
  responseRevision?: CommentEdvSnapshot | null;
  responseAttachment?: ReviewCommentAttachment | null;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  verifiedAt?: string | null;
}): React.ReactNode {
  const hasResolution =
    Boolean(responseRevision) ||
    Boolean(responseAttachment) ||
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
          <p className={layout.drawerMetaLabel}>Commented revision</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--color-text-primary)]">
              {commentedOn.documentTitle} · Rev {commentedOn.revisionLabel}
            </p>
            <EdvFileActions
              compact
              documentVersionId={commentedOn.documentVersionId}
              fileName={commentedOn.documentTitle}
            />
          </div>
        </div>
      )}

      {responseRevision ? (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-teal-600)]">
            Revised file
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {responseRevision.documentTitle} · Rev {responseRevision.revisionLabel}
            </p>
            <EdvFileActions
              compact
              documentVersionId={responseRevision.documentVersionId}
              fileName={responseRevision.documentTitle}
            />
          </div>
        </div>
      ) : resolvedAt ? (
        <p className={layout.drawerMutedText}>
          Marked resolved without a newer engineering revision on file.
        </p>
      ) : null}

      {responseAttachment ? (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-teal-600)]">
            Response attachment
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {responseAttachment.name}
            </p>
            <EdvFileActions
              compact
              documentVersionId={responseAttachment.documentVersionId}
              fileName={responseAttachment.name}
            />
          </div>
        </div>
      ) : null}

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
          {resolvedAt ? <span>Resolved {formatProjectDate(resolvedAt)}</span> : null}
          {verifiedAt ? <span>Verified {formatProjectDate(verifiedAt)}</span> : null}
        </div>
      )}
    </div>
  );
}
