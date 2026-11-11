import type { MessageInstance } from 'antd/es/message/interface';

/**
 * Shared client-side checks for flight / business-trip stepper forms.
 */

export function hasDuplicatePassengerIds(
  passengers: readonly { employeeId: string }[],
): boolean {
  const ids = passengers.map((row) => row.employeeId).filter(Boolean);
  return new Set(ids).size !== ids.length;
}

/** One toast listing every step validation issue (avoids silent / generic failures). */
export function notifyFormValidationErrors(
  messageApi: MessageInstance,
  errors: string[],
): void {
  const unique = [...new Set(errors.map((e) => e.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  if (unique.length === 1) {
    messageApi.error(unique[0]);
    return;
  }
  messageApi.error({
    content: unique.join(' · '),
    duration: 8,
  });
}
