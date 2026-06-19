'use client';

import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import type { CommentEdvSnapshot } from '@/lib/api/epc.types';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function CommentRevisionSection({
  commentedOn,
  responseRevision,
  resolutionNote,
  resolvedAt,
  verifiedAt,
}: {
  commentedOn?: CommentEdvSnapshot;
  responseRevision?: CommentEdvSnapshot | null;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  verifiedAt?: string | null;
}): React.ReactNode {
  const hasResolution =
    Boolean(responseRevision) ||
    Boolean(resolutionNote?.trim()) ||
    Boolean(resolvedAt);

  if (!hasResolution && !commentedOn) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">Designer response</h4>

      {commentedOn && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Commented revision
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-800">
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
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Revised file
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">
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
        <p className="text-sm text-slate-500">
          Marked resolved without a newer engineering revision on file.
        </p>
      ) : null}

      {resolutionNote?.trim() ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Resolution note
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {resolutionNote}
          </p>
        </div>
      ) : null}

      {(resolvedAt || verifiedAt) && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          {resolvedAt ? <span>Resolved {formatProjectDate(resolvedAt)}</span> : null}
          {verifiedAt ? <span>Verified {formatProjectDate(verifiedAt)}</span> : null}
        </div>
      )}
    </div>
  );
}
