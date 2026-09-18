'use client';

import { useState } from 'react';
import { Image, Spin } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface LightboxImage {
  /** Signed URL; `null` while it is still being fetched. */
  src: string | null;
  alt: string;
}

function stopPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * Controlled Ant Design image lightbox (zoom, rotate, arrows between images)
 * for images whose URLs are resolved on demand. Renders nothing inline.
 */
export default function ImageLightbox({
  open,
  images,
  current = 0,
  onClose,
  onChange,
}: {
  open: boolean;
  images: LightboxImage[];
  current?: number;
  onClose: () => void;
  onChange?: (current: number) => void;
}): React.ReactNode {
  if (images.length === 0) {
    return null;
  }

  return (
    // The preview is portalled, but React events still bubble to the owner
    // tree; keep lightbox clicks from reaching clickable table rows. Key
    // events must pass: the preview reads arrows / Esc from `window`.
    <span className="contents" onClick={stopPropagation}>
      <Image.PreviewGroup
        items={images.map((image) => ({ src: image.src ?? '', alt: image.alt }))}
        preview={{
          open,
          current,
          onOpenChange: (value) => {
            if (!value) {
              onClose();
            }
          },
          onChange: (next) => onChange?.(next),
          imageRender: (originalNode, info) =>
            images[info.current]?.src ? originalNode : <Spin size="large" />,
        }}
      />
    </span>
  );
}

/**
 * Makes an already-rendered photo (avatar, thumbnail) open full size in the
 * lightbox. `src` is the signed URL the photo is already displayed with, so
 * enlarging it needs no extra request.
 */
export function ImagePreviewTrigger({
  src,
  alt,
  children,
  className = '',
}: {
  src: string | null | undefined;
  alt: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [open, setOpen] = useState(false);

  if (!src) {
    return children;
  }

  return (
    <>
      <button
        type="button"
        className={`inline-flex cursor-zoom-in rounded-full border-0 bg-transparent p-0 ${className}`.trim()}
        aria-label={t('common.viewPhoto')}
        title={t('common.viewPhoto')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <ImageLightbox
        open={open}
        images={[{ src, alt }]}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
