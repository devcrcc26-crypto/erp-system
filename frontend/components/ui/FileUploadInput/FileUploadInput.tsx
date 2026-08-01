'use client';

import { Button, Typography } from 'antd';
import { Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import { tokens } from '@/lib/theme/tokens';

/**
 * Lightweight multi-file picker — selection only; parent owns upload.
 */
export default function FileUploadInput({
  files,
  onChange,
  accept,
  multiple = true,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}): React.ReactNode {
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
        icon={<Paperclip size={14} />}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{ alignSelf: 'flex-start' }}
      >
        Choose files
      </Button>
      {files.length > 0 ? (
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
    </div>
  );
}
