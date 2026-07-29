import type { Correspondence } from '@/lib/api/project-management.types';

/**
 * Builds "by Y on behalf of Z" when the actor differs from the named party.
 */
function onBehalfSuffix(actorName: string | null | undefined, namedParty: string): string {
  const actor = actorName?.trim();
  const party = namedParty.trim();
  if (!actor) {
    return party ? ` on behalf of ${party}` : '';
  }
  if (!party || actor === party) {
    return ` by ${actor}`;
  }
  return ` by ${actor} on behalf of ${party}`;
}

/**
 * Named internal party: From for outgoing, To for incoming.
 */
export function correspondenceNamedParty(item: Correspondence): string {
  return item.direction === 'OUTGOING' ? item.senderName : item.recipientName;
}

/**
 * Attribution for who recorded the correspondence in the system.
 */
export function formatCorrespondenceRecordedAttribution(
  item: Correspondence,
): string {
  return `Recorded${onBehalfSuffix(item.createdByName, correspondenceNamedParty(item))}`;
}

/**
 * Attribution for Mark as Sent.
 */
export function formatCorrespondenceSentAttribution(
  item: Correspondence,
): string | null {
  if (!item.sentAt) {
    return null;
  }
  return `Sent to ${item.recipientName}${onBehalfSuffix(
    item.sentByName,
    item.senderName,
  )}`;
}

/**
 * Attribution for acknowledgement (manual or via response).
 */
export function formatCorrespondenceAcknowledgedAttribution(
  item: Correspondence,
): string | null {
  if (!item.acknowledgedAt) {
    return null;
  }
  const namedParty = item.recipientName;
  return `Acknowledged${onBehalfSuffix(item.acknowledgedByName, namedParty)}`;
}
