'use client';

import { Button, Typography } from 'antd';
import { Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
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
 * Lightweight multi-file picker — selection only; parent owns upload.
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
        <ul className="m-0 list-none space-y-1 p-0">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
              style={{
                border: `1px solid ${tokens.colorBorder}`,
                background: tokens.colorPageBg,
              }}
            >
              <Typography.Text ellipsis className="min-w-0 flex-1 text-sm">
                {file.name}
              </Typography.Text>
              <Button
                type="text"
                size="small"
                danger
                disabled={disabled}
                icon={<X size={14} />}
                aria-label={`Remove ${file.name}`}
                onClick={() => removeAt(index)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {compact && files.length > 0 ? (
        <Typography.Text
          type="secondary"
          ellipsis
          style={{ fontSize: 12, maxWidth: 160 }}
        >
          {files[0]?.name}
        </Typography.Text>
      ) : null}
    </div>
  );
}
