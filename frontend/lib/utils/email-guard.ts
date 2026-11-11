const FAKE_EMAIL_DOMAINS = [
  'erp.com',
  'erp-demo.com',
  'demo.com',
  'test.com',
  'example.com',
  'placeholder.com',
  'fake.com',
  'company.local',
];

/**
 * Returns true when the address looks like a demo/seed account email.
 */
export function isLikelyFakeEmail(email: string): boolean {
  if (!email || !email.includes('@')) {
    return false;
  }

  const lower = email.toLowerCase().trim();
  const domain = lower.split('@')[1];
  return FAKE_EMAIL_DOMAINS.includes(domain);
}

export const DEMO_EMAIL_WARNING =
  'This looks like a demo account email address. To test this feature, please add a real employee with a working email address you have access to, then use that account. Go to Settings → Users → Add Employee to create one.';
