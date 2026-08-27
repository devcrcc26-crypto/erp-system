'use client';

import { useRef } from 'react';
import { Button, Typography } from 'antd';
import { Paperclip, X } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  formatSealFileSize,
  resolveSealFileKind,
} from '@/lib/utils/seal-file-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Local-file tile grid matching SealDocumentGallery (add-form selection).
 */
export function SealLocalFileTiles({
  files,
  onRemove,
  emptyLabel,
  readOnly = false,
}: {
  files: File[];
  onRemove?: (index: number) => void;
  emptyLabel?: string;
  readOnly?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (files.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyLabel ?? t('hr.empty.noAttachments')}
      </Typography.Text>
    );
  }

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {files.map((file, index) => {
        const meta = resolveSealFileKind(file.name, file.type);
        const sizeLabel = formatSealFileSize(file.size);
        return (
          <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
            <div
              className="flex w-full items-center gap-3 rounded-none border px-3 py-3"
              style={{
                borderColor: tokens.colorBorder,
                background: tokens.colorCardBg,
              }}
            >
              <div
                className="relative flex h-12 w-10 shrink-0 items-end justify-center pb-1.5"
                aria-hidden
              >
                <div
                  className="absolute inset-0 rounded-[2px]"
                  style={{
                    background: meta.soft,
                    border: `1px solid ${meta.accent}33`,
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-t-[10px] border-l-transparent"
                  style={{ borderTopColor: meta.accent }}
                />
                <span
                  className="relative z-[1] text-[9px] font-bold tracking-wide"
                  style={{ color: meta.accent }}
                >
                  {meta.label}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="m-0 truncate text-sm font-medium"
                  style={{ color: tokens.colorTextPrimary }}
                  title={file.name}
                >
                  {file.name}
                </p>
                <p
                  className="m-0 mt-0.5 text-xs"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {[meta.label, sizeLabel].filter(Boolean).join(' · ') ||
                    t('hr.labels.attachment')}
                </p>
              </div>
              {!readOnly && onRemove ? (
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<X size={14} />}
                  aria-label={`${t('hr.labels.remove')} ${file.name}`}
                  onClick={() => onRemove(index)}
                  style={{ borderRadius: 0 }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Seal add-form file picker — same tile UI as detail document gallery.
 */
export default function SealFilePicker({
  files,
  onChange,
  accept,
  multiple = true,
  disabled = false,
  placeholder,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) {
      return;
    }
    const next = multiple ? [...files, ...picked] : picked.slice(0, 1);
    onChange(next);
    event.target.value = '';
  }

  function removeAt(index: number): void {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handlePick}
      />
      <Button
        type="default"
        icon={<Paperclip size={14} />}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{ alignSelf: 'flex-start', borderRadius: 0 }}
      >
        {placeholder ?? t('hr.buttons.chooseDocumentOptional')}
      </Button>
      <SealLocalFileTiles
        files={files}
        onRemove={disabled ? undefined : removeAt}
        emptyLabel={t('hr.empty.noAttachments')}
      />
    </div>
  );
}
