import type { PreviewDocument } from '@/components/shared/preview';
import type { ExitPermitItem } from '@/lib/api/exit-permit.types';

/**
 * Item photos of an exit permit, for one shared preview lightbox. Item photo
 * uploads accept images only, so a missing MIME type is treated as JPEG.
 */
export function exitPermitItemImages(
  items: ExitPermitItem[] | undefined,
): PreviewDocument[] {
  return (items ?? []).flatMap((item) => {
    const id = item.documentId ?? item.image?.id;
    if (!id) {
      return [];
    }
    return [
      {
        id,
        name: item.image?.name || item.itemName,
        fileType: item.image?.fileType || 'image/jpeg',
      },
    ];
  });
}
