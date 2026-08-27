import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { tokens } from '@/lib/theme/tokens';

export type SealFileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'image'
  | 'cad'
  | 'archive'
  | 'other';

export interface SealFileKindMeta {
  kind: SealFileKind;
  label: string;
  accent: string;
  soft: string;
  Icon: typeof FileText;
}

/**
 * Human-readable file size for seal file tiles.
 */
export function formatSealFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionFromName(name: string): string {
  const parts = name.split('.');
  if (parts.length < 2) {
    return '';
  }
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

/**
 * Resolve color/icon metadata from a file name and optional MIME type.
 */
export function resolveSealFileKind(
  name: string,
  fileType?: string | null,
): SealFileKindMeta {
  const ext = extensionFromName(name);
  const mime = (fileType ?? '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      kind: 'pdf',
      label: 'PDF',
      accent: '#DC2626',
      soft: '#FEF2F2',
      Icon: FileText,
    };
  }
  if (
    ['doc', 'docx', 'rtf'].includes(ext) ||
    mime.includes('word') ||
    mime.includes('msword')
  ) {
    return {
      kind: 'word',
      label: 'WORD',
      accent: '#2563EB',
      soft: '#EFF6FF',
      Icon: FileText,
    };
  }
  if (
    ['xls', 'xlsx', 'csv'].includes(ext) ||
    mime.includes('sheet') ||
    mime.includes('excel')
  ) {
    return {
      kind: 'excel',
      label: 'EXCEL',
      accent: '#059669',
      soft: '#ECFDF5',
      Icon: FileSpreadsheet,
    };
  }
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ||
    mime.startsWith('image/')
  ) {
    return {
      kind: 'image',
      label: 'IMAGE',
      accent: '#7C3AED',
      soft: '#F5F3FF',
      Icon: FileImage,
    };
  }
  if (
    [
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
    ].includes(ext)
  ) {
    return {
      kind: 'cad',
      label: 'CAD',
      accent: '#D4610A',
      soft: '#FEF0E6',
      Icon: File,
    };
  }
  if (['zip', '7z', 'rar'].includes(ext) || mime.includes('zip')) {
    return {
      kind: 'archive',
      label: 'ZIP',
      accent: '#6B7280',
      soft: '#F3F4F6',
      Icon: FileArchive,
    };
  }
  return {
    kind: 'other',
    label: (ext || 'FILE').toUpperCase(),
    accent: tokens.colorTextSecondary,
    soft: tokens.colorPageBg,
    Icon: File,
  };
}
