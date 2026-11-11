import {
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Parses YYYY-MM-DD (as UTC midnight) or ISO strings; null when unparseable. */
function toUtcDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whole years between `birth` and `on`. */
export function ageInYears(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Skips the property's other validators when it is null, undefined, or a
 * blank string. Unlike `@IsOptional()`, blank strings are also skipped, so an
 * update can still send '' to clear a field.
 */
export function IsOptionalText(): PropertyDecorator {
  return ValidateIf(
    (_object: object, value: unknown) =>
      !(
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')
      ),
  );
}

/** Date must be today or earlier. Unparseable values are left to `@IsDateString`. */
export function IsNotFutureDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isNotFutureDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: '$property cannot be in the future', ...options },
      validator: {
        validate(value: unknown): boolean {
          const date = toUtcDate(value);
          return date === null || date.getTime() <= todayUtc().getTime();
        },
      },
    });
  };
}

/** Birth date must give an age between `min` and `max` years today (inclusive). */
export function IsAgeBetween(
  min: number,
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isAgeBetween',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [min, max],
      options: {
        message: `$property must give an age between ${min} and ${max} years`,
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          const birth = toUtcDate(value);
          if (birth === null) {
            return true;
          }
          const age = ageInYears(birth, todayUtc());
          return age >= min && age <= max;
        },
      },
    });
  };
}

/** Date must not be earlier than another date property on the same object. */
export function IsNotBeforeProperty(
  property: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isNotBeforeProperty',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [property],
      options: { message: `$property cannot be before ${property}`, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const date = toUtcDate(value);
          const other = toUtcDate((args.object as Record<string, unknown>)[property]);
          return date === null || other === null || date.getTime() >= other.getTime();
        },
      },
    });
  };
}
