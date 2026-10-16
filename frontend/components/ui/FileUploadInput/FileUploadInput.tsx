'use client';

import { Button, Typography } from 'antd';
import { Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { tokens } from '@/lib/theme/tokens';

export interface FileUploadInputProps {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Smaller button; hides the inline selected-file list (parent shows Upload). */
  compact?: boolean;
}

/**
 * Lightweight multi-file picker - selection only; parent owns upload.
 * Selected files are shown with type icons (PDF, Word, image, etc.).
 */
export default function FileUploadInput({
  files,
  onChange,
  accept,
  multiple = true,
  disabled = false,
  placeholder,
  compact = false,
}: FileUploadInputProps): React.ReactNode {
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

  const buttonLabel =
    placeholder ?? (multiple ? 'Choose files' : 'Choose file');

  return (
    <div className="flex flex-col gap-2">
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
        size={compact ? 'small' : 'middle'}
        icon={<Paperclip size={compact ? 12 : 14} />}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{ alignSelf: 'flex-start' }}
      >
        {buttonLabel}
      </Button>
      {!compact && files.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
            >
              <div
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  border: `1px solid ${tokens.colorBorder}`,
                  background: tokens.colorPageBg,
                }}
              >
                <ProfileFileTypeIcon
                  name={file.name}
                  fileType={file.type}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <Typography.Text
                    ellipsis
                    className="block text-sm font-medium"
                    title={file.name}
                  >
                    {file.name}
                  </Typography.Text>
                  <Typography.Text
                    type="secondary"
                    className="block text-xs"
                    style={{ fontSize: 12 }}
                  >
                    {profileFileMetaLine(file.name, file.type, file.size) ||
                      'File'}
                  </Typography.Text>
                </div>
                <Button
                  type="text"
                  size="small"
                  danger
                  disabled={disabled}
                  icon={<X size={14} />}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeAt(index)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {compact && files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="inline-flex items-center gap-1"
              title={file.name}
            >
              <ProfileFileTypeIcon
                name={file.name}
                fileType={file.type}
                size="sm"
              />
              <Button
                type="text"
                size="small"
                danger
                disabled={disabled}
                icon={<X size={12} />}
                aria-label={`Remove ${file.name}`}
                onClick={() => removeAt(index)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
