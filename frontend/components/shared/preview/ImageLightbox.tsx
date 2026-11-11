'use client';

import { cloneElement, useState } from 'react';
import { Image, Spin, Tooltip } from 'antd';
import {
  Download,
  FlipHorizontal2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface LightboxImage {
  /** Signed URL; `null` while it is still being fetched. */
  src: string | null;
  alt: string;
}

function stopPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

/** Round icon button on the dark lightbox toolbar. */
function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    // The image preview sits at z-index 1080, above default tooltips (1070).
    <Tooltip title={label} placement="top" zIndex={1090}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {children}
      </button>
    </Tooltip>
  );
}

const ICON = { size: 17, strokeWidth: 1.75 } as const;

/**
 * Ant Design caps the preview at 70% height and never enlarges an image past
 * its natural size, so phone-compressed receipts and small photos show tiny.
 * Size the image box to the space between the close button and the toolbar
 * and let `object-fit: contain` scale the picture up or down to fill it. The
 * preview's own transform (zoom / drag / rotate) stays on the same element.
 */
function fitToViewport(node: React.ReactElement): React.ReactElement {
  const props = node.props as { style?: React.CSSProperties };
  return cloneElement(node, {
    style: {
      ...props.style,
      width: 'min(94vw, 1600px)',
      height: 'calc(100dvh - 160px)',
      maxWidth: 'none',
      maxHeight: 'none',
      objectFit: 'contain',
    },
  } as Partial<unknown>);
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
  onDownload,
}: {
  open: boolean;
  images: LightboxImage[];
  current?: number;
  onClose: () => void;
  onChange?: (current: number) => void;
  /** Shows a download action for the image at this index. */
  onDownload?: (index: number) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();

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
        styles={{
          popup: {
            mask: {
              background: 'rgba(15, 23, 42, 0.86)',
              backdropFilter: 'blur(6px)',
            },
            footer: { paddingBottom: 24 },
          },
        }}
        preview={{
          open,
          current,
          onOpenChange: (value) => {
            if (!value) {
              onClose();
            }
          },
          onChange: (next) => onChange?.(next),
          closeIcon: (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-900/70 text-white backdrop-blur"
              aria-label={t('common.closePreview')}
            >
              <X size={20} strokeWidth={1.75} />
            </span>
          ),
          countRender: () => null,
          imageRender: (originalNode, info) =>
            images[info.current ?? 0]?.src ? (
              fitToViewport(originalNode)
            ) : (
              <Spin size="large" />
            ),
          actionsRender: (_node, { actions, transform, current: index, total }) => (
            <div className="flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-full border border-white/15 bg-slate-900/80 py-1 pl-4 pr-1 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="mr-2 flex min-w-0 flex-col leading-tight">
                <span
                  className="max-w-[160px] truncate text-[13px] font-medium sm:max-w-[260px]"
                  title={images[index]?.alt}
                >
                  {images[index]?.alt}
                </span>
                {total > 1 ? (
                  <span className="text-[11px] text-white/60">
                    {t('common.imageCount', {
                      current: index + 1,
                      total,
                    })}
                  </span>
                ) : null}
              </div>
              <span className="h-6 w-px shrink-0 bg-white/15" aria-hidden />
              <ToolbarButton
                label={t('common.zoomOut')}
                onClick={actions.onZoomOut}
                disabled={transform.scale <= 1}
              >
                <ZoomOut {...ICON} />
              </ToolbarButton>
              <ToolbarButton label={t('common.zoomIn')} onClick={actions.onZoomIn}>
                <ZoomIn {...ICON} />
              </ToolbarButton>
              <span className="hidden sm:contents">
                <ToolbarButton
                  label={t('common.rotateLeft')}
                  onClick={actions.onRotateLeft}
                >
                  <RotateCcw {...ICON} />
                </ToolbarButton>
                <ToolbarButton
                  label={t('common.rotateRight')}
                  onClick={actions.onRotateRight}
                >
                  <RotateCw {...ICON} />
                </ToolbarButton>
                <ToolbarButton
                  label={t('common.flipHorizontal')}
                  onClick={actions.onFlipX}
                >
                  <FlipHorizontal2 {...ICON} />
                </ToolbarButton>
              </span>
              <ToolbarButton label={t('common.resetView')} onClick={actions.onReset}>
                <Undo2 {...ICON} />
              </ToolbarButton>
              {onDownload ? (
                <>
                  <span className="h-6 w-px shrink-0 bg-white/15" aria-hidden />
                  <ToolbarButton
                    label={t('common.download')}
                    onClick={() => onDownload(index)}
                  >
                    <Download {...ICON} />
                  </ToolbarButton>
                </>
              ) : null}
            </div>
          ),
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
