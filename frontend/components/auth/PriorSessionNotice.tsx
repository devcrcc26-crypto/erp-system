interface PriorSessionNoticeProps {
  priorUserEmail: string | null;
  message: string;
}

/** Warns when an auth flow started while another account was signed in. */
export function PriorSessionNotice({
  priorUserEmail,
  message,
}: PriorSessionNoticeProps): React.ReactNode {
  if (!priorUserEmail) {
    return null;
  }

  return (
    <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      You were signed in as <span className="font-medium">{priorUserEmail}</span>.{' '}
      {message}
    </p>
  );
}
