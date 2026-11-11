import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when the value looks like a UUID entity id.
 */
export function looksLikeEntityUuid(value: string | undefined): boolean {
  return Boolean(value && UUID_PATTERN.test(value));
}

/**
 * Strips sensitive fields from values persisted in audit logs.
 */
export function sanitizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Decimal.isDecimal(value)) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        continue;
      }
      result[key] = sanitizeAuditValue(val);
    }
    return result;
  }
  return value;
}

/**
 * Converts a Prisma record into JSON-safe audit snapshot data.
 */
export function toAuditJsonSnapshot(
  record: unknown,
): Prisma.InputJsonValue | undefined {
  if (record === null || record === undefined) {
    return undefined;
  }

  const sanitized = sanitizeAuditValue(record);
  return JSON.parse(JSON.stringify(sanitized)) as Prisma.InputJsonValue;
}
