'use client';

import { DocumentPreview } from '@/components/shared/preview';
import {
  employmentDocumentDownloadPath,
  type EmploymentAttachment,
} from '@/lib/api/employment';

/** Compact list of inactive/separation supporting documents. */
export default function EmploymentAttachmentsList({
  userId,
  attachments,
}: {
  userId: string;
  attachments: EmploymentAttachment[];
}): React.ReactNode {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
      {attachments.map((doc) => (
        <li key={doc.id}>
          <DocumentPreview
            documentId={doc.id}
            fileName={doc.name}
            fileType={doc.fileType}
            fileSizeBytes={doc.fileSizeBytes}
            urlPath={employmentDocumentDownloadPath(userId, doc.id)}
            metaExtra={new Date(doc.createdAt).toLocaleDateString()}
          />
        </li>
      ))}
    </ul>
  );
}
