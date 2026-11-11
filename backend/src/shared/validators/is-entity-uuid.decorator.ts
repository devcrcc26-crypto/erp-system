import { Matches, type ValidationOptions } from 'class-validator';

const ENTITY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates UUID-shaped entity IDs stored in PostgreSQL.
 * Accepts deterministic seed IDs that are not strict RFC-4122 UUIDs.
 */
export function IsEntityUuid(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Matches(ENTITY_UUID_PATTERN, {
    message: '$property must be a UUID',
    ...validationOptions,
  });
}
