import { ReviewSessionAttachment } from '@prisma/client';

export interface MappedReviewSessionAttachment {
  id: string;
  tier: string;
  purpose: string | null;
  note: string | null;
  attachedAt: string;
  attachedByUser: { id: string; name: string };
  document: { id: string; name: string; downloadUrl: string };
}

type ReviewSessionAttachmentRow = ReviewSessionAttachment & {
  attachedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    chineseName?: string | null;
  };
  document: { id: string; name: string };
};

function formatAttachmentUserName(user: {
  firstName: string;
  lastName: string;
  chineseName?: string | null;
}): string {
  const english = `${user.firstName} ${user.lastName}`.trim();
  const chinese = user.chineseName?.trim();
  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  return english || chinese || 'Unknown user';
}

/**
 * Maps a review session attachment row to the API response shape.
 */
export function mapReviewSessionAttachment(
  row: ReviewSessionAttachmentRow,
): MappedReviewSessionAttachment {
  return {
    id: row.id,
    tier: row.tier,
    purpose: row.purpose,
    note: row.note,
    attachedAt: row.attachedAt.toISOString(),
    attachedByUser: {
      id: row.attachedByUser.id,
      name: formatAttachmentUserName(row.attachedByUser),
    },
    document: {
      id: row.document.id,
      name: row.document.name,
      downloadUrl: `/documents/${row.document.id}/download-url`,
    },
  };
}

export function mapReviewSessionAttachments(
  rows: ReviewSessionAttachmentRow[],
): MappedReviewSessionAttachment[] {
  return rows.map(mapReviewSessionAttachment);
}
