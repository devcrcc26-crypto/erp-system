'use client';

import { useEffect, useState } from 'react';
import { Avatar, Tooltip } from 'antd';
import { ImageOff } from 'lucide-react';
import { tokens } from '@/lib/theme/tokens';

/**
 * Local File object thumbnail (create/edit forms before upload).
 */
export default function LocalFileImageThumb({
  file,
  size = 40,
  emptyLabel,
}: {
  file?: File | null;
  size?: number;
  emptyLabel?: string;
}): React.ReactNode {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!file || !url) {
    const placeholder = (
      <span
        className="inline-flex items-center justify-center rounded-lg border border-[#e8ebef] bg-[#f8f9fb] text-[#9AA4B2]"
        style={{ width: size, height: size }}
        aria-label={emptyLabel}
      >
        <ImageOff size={Math.max(14, Math.round(size * 0.4))} strokeWidth={1.75} />
      </span>
    );
    return emptyLabel ? (
      <Tooltip title={emptyLabel}>{placeholder}</Tooltip>
    ) : (
      placeholder
    );
  }

  return (
    <Tooltip title={file.name}>
      <Avatar
        size={size}
        shape="square"
        src={url}
        alt={file.name}
        style={{
          flexShrink: 0,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
        }}
      />
    </Tooltip>
  );
}
