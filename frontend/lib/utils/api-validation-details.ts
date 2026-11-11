type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface ClassValidatorNode {
  property?: string;
  constraints?: Record<string, string>;
  children?: ClassValidatorNode[];
}

const FIELD_LABEL_KEYS: Record<string, string> = {
  purpose: 'hr.form.purpose',
  originCountry: 'hr.form.originCountry',
  originCity: 'hr.form.originCity',
  destination: 'hr.form.destination',
  destinationCountry: 'hr.form.destinationCountry',
  destinationCity: 'hr.form.destinationCity',
  departureDate: 'hr.form.departureDate',
  returnDate: 'hr.form.returnDate',
  ticketClass: 'hr.form.ticketClass',
  passengers: 'hr.form.passengers',
  employeeId: 'hr.labels.employee',
  hostOrganization: 'hr.form.hostOrganizationName',
  hostContactName: 'hr.form.hostContactName',
  hostContactPhone: 'hr.form.hostContactPhone',
  hostContactEmail: 'hr.form.hostContactEmail',
  expectedOutcomes: 'hr.form.expectedOutcomes',
  itinerary: 'hr.form.itinerary',
  notes: 'hr.form.notes',
  passportNumber: 'hr.form.passportNumber',
};

function fieldLabel(property: string, t: TFn): string {
  const key = FIELD_LABEL_KEYS[property];
  if (key) {
    return t(key);
  }
  return property
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

/**
 * Maps class-validator English defaults to plain-language copy.
 */
export function humanizeClassValidatorMessage(raw: string, t: TFn): string {
  const trimmed = raw.trim();
  if (/^property\s+\w+\s+should not exist$/i.test(trimmed)) {
    return t('errors.api.validation');
  }

  const notEmpty = /^(\w+)\s+should not be empty$/i.exec(trimmed);
  if (notEmpty?.[1]) {
    return t('errors.api.fieldRequired', {
      field: fieldLabel(notEmpty[1], t),
    });
  }

  const mustBeUuid = /^(\w+)\s+must be a UUID$/i.exec(trimmed);
  if (mustBeUuid?.[1]) {
    return t('errors.api.invalidSelection', {
      field: fieldLabel(mustBeUuid[1], t),
    });
  }

  const mustBeEnum = /^(\w+)\s+must be one of the following values:/i.exec(
    trimmed,
  );
  if (mustBeEnum?.[1]) {
    return t('errors.api.invalidSelection', {
      field: fieldLabel(mustBeEnum[1], t),
    });
  }

  const maxLength = /^(\w+)\s+must be shorter than or equal to \d+ characters$/i.exec(
    trimmed,
  );
  if (maxLength?.[1]) {
    return t('errors.api.fieldTooLong', {
      field: fieldLabel(maxLength[1], t),
    });
  }

  return trimmed;
}

/**
 * Flattens NestJS / class-validator error trees into user-facing strings.
 */
export function extractApiValidationMessages(details: unknown): string[] {
  if (details == null) {
    return [];
  }

  if (Array.isArray(details)) {
    if (details.every((item) => typeof item === 'string')) {
      return details.filter((item) => item.trim().length > 0);
    }
    return flattenValidatorNodes(details as ClassValidatorNode[]);
  }

  if (typeof details === 'object') {
    const record = details as Record<string, unknown>;
    if (record.constraints && typeof record.constraints === 'object') {
      return flattenValidatorNodes([record as ClassValidatorNode]);
    }
  }

  return [];
}

function flattenValidatorNodes(nodes: ClassValidatorNode[]): string[] {
  const messages: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.constraints) {
      for (const text of Object.values(node.constraints)) {
        if (typeof text === 'string' && text.trim()) {
          messages.push(text.trim());
        }
      }
    }
    if (node.children?.length) {
      messages.push(...flattenValidatorNodes(node.children));
    }
  }

  return [...new Set(messages)];
}

export function formatUserValidationFromDetails(
  details: unknown,
  t: TFn,
): string | null {
  const raw = extractApiValidationMessages(details);
  const human = [
    ...new Set(
      raw.map((message) => humanizeClassValidatorMessage(message, t)),
    ),
  ];
  return joinValidationMessages(human);
}

/** Join validation lines for toasts and alert titles. */
export function joinValidationMessages(messages: string[]): string | null {
  if (messages.length === 0) {
    return null;
  }
  if (messages.length === 1) {
    return messages[0] ?? null;
  }
  if (messages.length <= 4) {
    return messages.join(' ');
  }
  const head = messages.slice(0, 3).join(' ');
  return `${head} (+${messages.length - 3} more)`;
}
