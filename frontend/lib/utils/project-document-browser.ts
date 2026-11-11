import type {
  ProjectDocumentFolderContextType,
  ProjectDocumentRecord,
} from '@/lib/api/documents.types';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';

export const PROJECT_DOCUMENT_CONTEXT_OPTIONS: Array<{
  value: ProjectDocumentFolderContextType;
  label: string;
}> = [
  { value: 'PROJECT', label: 'Project repository' },
  { value: 'TASK_DISCIPLINE', label: 'Discipline' },
  { value: 'RFI', label: 'RFI' },
  { value: 'SUBMITTAL', label: 'Submittal' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'PUNCH_ITEM', label: 'Punch item' },
  { value: 'DAILY_LOG', label: 'Daily log' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'RISK', label: 'Risk' },
];

export const PROJECT_DOCUMENT_FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Images' },
  { value: 'word', label: 'Word' },
  { value: 'excel', label: 'Excel' },
  { value: 'other', label: 'Other' },
] as const;

export function formatFolderContextLabel(contextType: string): string {
  const match = PROJECT_DOCUMENT_CONTEXT_OPTIONS.find(
    (option) => option.value === contextType,
  );
  if (match) {
    return match.label;
  }
  return contextType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) =>
    c.toUpperCase(),
  );
}

export function resolveProjectDocumentSourceLabel(
  record: ProjectDocumentRecord,
): string {
  const contextLabel = formatFolderContextLabel(record.folderContextType);
  if (record.folderContextType === 'TASK_DISCIPLINE') {
    return record.disciplineIndex != null
      ? formatDisciplineLabel(record.disciplineIndex)
      : (record.disciplineName ?? contextLabel);
  }
  if (record.folderContextType === 'PROJECT') {
    return 'Project repository';
  }
  return `${contextLabel} · ${record.folderName}`;
}

export function resolveProjectDocumentEntityHref(
  projectId: string,
  record: ProjectDocumentRecord,
): string | null {
  if (!record.folderContextId) {
    return null;
  }

  switch (record.folderContextType) {
    case 'RFI':
      return `/projects/${projectId}/rfis?highlight=${record.folderContextId}`;
    case 'SUBMITTAL':
      return `/projects/${projectId}/submittals?highlight=${record.folderContextId}`;
    case 'ISSUE':
      return `/projects/${projectId}/issues?highlight=${record.folderContextId}`;
    case 'PUNCH_ITEM':
      return `/projects/${projectId}/punch-list?highlight=${record.folderContextId}`;
    case 'DAILY_LOG':
      return `/projects/${projectId}/daily-logs?highlight=${record.folderContextId}`;
    case 'MEETING':
      return `/projects/${projectId}/meetings?highlight=${record.folderContextId}`;
    case 'CORRESPONDENCE':
      return `/projects/${projectId}/correspondence?highlight=${record.folderContextId}`;
    case 'RISK':
      return `/projects/${projectId}/risks?highlight=${record.folderContextId}`;
    case 'TASK_DISCIPLINE':
      // Discipline workspace detail is lead/admin only - send browsers to the list.
      return `/projects/${projectId}/disciplines`;
    default:
      return null;
  }
}
