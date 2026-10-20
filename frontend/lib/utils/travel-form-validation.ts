/**
 * Shared client-side checks for flight / business-trip stepper forms.
 */

export function hasDuplicatePassengerIds(
  passengers: readonly { employeeId: string }[],
): boolean {
  const ids = passengers.map((row) => row.employeeId).filter(Boolean);
  return new Set(ids).size !== ids.length;
}
