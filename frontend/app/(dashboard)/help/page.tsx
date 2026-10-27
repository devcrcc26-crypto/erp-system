import { HelpGettingStartedPage } from '@/components/help/HelpGettingStartedPage';

/**
 * `/help` renders Getting Started in place — no redirect/router.replace.
 * Soft redirects via next/navigation trigger a Next.js 16 App Router hooks bug.
 */
export default function HelpRootPage(): React.ReactNode {
  return <HelpGettingStartedPage />;
}
