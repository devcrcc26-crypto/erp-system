'use client';

import { useRef } from 'react';
import { Button, Typography } from 'antd';
import { Paperclip, X } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

/**
 * Local-file tile grid with file-type icons (add-form selection).
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
      {files.map((file, index) => (
        <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
          <div
            className="flex w-full items-center gap-3 rounded-xl border px-3 py-3"
            style={{
              borderColor: tokens.colorBorder,
              background: tokens.colorCardBg,
            }}
          >
            <ProfileFileTypeIcon
              name={file.name}
              fileType={file.type}
              size="md"
            />
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
                {profileFileMetaLine(file.name, file.type, file.size) ||
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
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Seal add-form file picker - same icon tiles as detail document gallery.
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
        style={{ alignSelf: 'flex-start' }}
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
