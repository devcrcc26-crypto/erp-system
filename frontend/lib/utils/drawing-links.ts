import type { EntityLink, EntityLinkType } from '@/lib/api/documents.types';
import type { DrawingLink } from '@/lib/api/project-management.types';

const ENTITY_TYPE_MAP: Record<string, EntityLinkType> = {
  drawing: 'drawing',
  DRAWING: 'drawing',
  rfi: 'rfi',
  RFI: 'rfi',
  submittal: 'submittal',
  SUBMITTAL: 'submittal',
  issue: 'issue',
  ISSUE: 'issue',
  punch_item: 'punch_item',
  PUNCH_ITEM: 'punch_item',
};

export function drawingLinkToEntityLink(link: DrawingLink): EntityLink {
  const entityType =
    ENTITY_TYPE_MAP[link.linkedEntityType] ?? ('rfi' as EntityLinkType);

  return {
    entityType,
    entityId: link.linkedEntityId,
    label: `${link.linkedEntityType} - ${link.linkedEntityId}`,
  };
}

export function entityLinkToDrawingLinkPayload(link: EntityLink): {
  linkedEntityType: string;
  linkedEntityId: string;
  label?: string;
} {
  return {
    linkedEntityType: link.entityType.toUpperCase(),
    linkedEntityId: link.entityId,
    label: link.label,
  };
}
