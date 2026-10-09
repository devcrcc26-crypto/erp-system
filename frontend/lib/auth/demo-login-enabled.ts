/**
 * Demo / quick-login UI is never available in production builds.
 * Non-production also requires an explicit opt-in flag.
 */
export function isDemoLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true'
  );
}
