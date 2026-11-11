import { DEMO_EMAIL_WARNING, isLikelyFakeEmail } from '@/lib/utils/email-guard';

interface DemoEmailWarningProps {
  email: string;
}

export function DemoEmailWarning({ email }: DemoEmailWarningProps): React.ReactNode {
  if (!isLikelyFakeEmail(email)) {
    return null;
  }

  return (
    <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span aria-hidden="true">⚠ </span>
      {DEMO_EMAIL_WARNING}
    </p>
  );
}
