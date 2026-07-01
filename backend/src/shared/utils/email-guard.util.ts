const FAKE_EMAIL_DOMAINS = [
  'erp.com',
  'erp-demo.com',
  'demo.com',
  'test.com',
  'example.com',
  'placeholder.com',
  'fake.com',
  'localhost.com',
  'company.local',
  'test.local',
];

const FAKE_EMAIL_PATTERNS = [
  /^admin@/,
  /^superadmin@/,
  /^seed@/,
  /^demo@/,
  /^test@/,
  /^noreply@/,
  /^no-reply@/,
];

/**
 * Returns true when the address should not receive real outbound email.
 */
export function isLikelyFakeEmail(email: string): boolean {
  if (!email || !email.includes('@')) {
    return true;
  }

  const lower = email.toLowerCase().trim();
  const domain = lower.split('@')[1];

  if (FAKE_EMAIL_DOMAINS.includes(domain)) {
    return true;
  }

  if (FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(lower))) {
    return true;
  }

  return false;
}
