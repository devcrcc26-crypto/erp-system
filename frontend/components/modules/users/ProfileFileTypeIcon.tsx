'use client';

import {
  formatSealFileSize,
  resolveSealFileKind,
} from '@/lib/utils/seal-file-display';

interface ProfileFileTypeIconProps {
  name: string;
  fileType?: string | null;
  size?: 'sm' | 'md';
}

/**
 * Colored file-type icon badge for employee profile documents.
 */
export default function ProfileFileTypeIcon({
  name,
  fileType,
  size = 'md',
}: ProfileFileTypeIconProps): React.ReactNode {
  const meta = resolveSealFileKind(name, fileType);
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const iconSize = size === 'sm' ? 16 : 20;

  return (
    <div
      className={`erp-profile-file-icon ${box} flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border`}
      style={{
        background: meta.soft,
        color: meta.accent,
        borderColor: `${meta.accent}33`,
      }}
      aria-hidden
      title={meta.label}
    >
      <meta.Icon size={iconSize} strokeWidth={1.75} />
      {size === 'md' ? (
        <span className="text-[8px] font-bold leading-none tracking-wide">
          {meta.label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Secondary line: type · size (and optional extra).
 */
export function profileFileMetaLine(
  name: string,
  fileType?: string | null,
  fileSizeBytes?: number,
  extra?: string,
): string {
  const meta = resolveSealFileKind(name, fileType);
  const sizeLabel = formatSealFileSize(fileSizeBytes);
  return [meta.label, sizeLabel, extra].filter(Boolean).join(' · ');
}
