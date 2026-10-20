export interface BusinessTripHostFields {
  hostOrganization?: string | null;
  hostContactName?: string | null;
  hostContactPhone?: string | null;
  hostContactEmail?: string | null;
}

export function hasBusinessTripHostDetails(trip: BusinessTripHostFields): boolean {
  return Boolean(
    trip.hostOrganization?.trim() ||
      trip.hostContactName?.trim() ||
      trip.hostContactPhone?.trim() ||
      trip.hostContactEmail?.trim(),
  );
}

/** Single-line summary for review steps. */
export function formatBusinessTripHostContactSummary(
  trip: BusinessTripHostFields,
): string {
  const parts = [
    trip.hostContactName?.trim(),
    trip.hostContactPhone?.trim(),
    trip.hostContactEmail?.trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}
