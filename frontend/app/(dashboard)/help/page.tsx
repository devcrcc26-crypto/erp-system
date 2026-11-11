import { HelpGettingStartedPage } from '@/components/help/HelpGettingStartedPage';

/**
 * `/help` is redirected to `/help/getting-started` in `next.config.ts`, before
 * render. This page is only a fallback and renders Getting Started in place —
 * never a next/navigation redirect, which triggers a Next.js 16 hooks bug.
 */
export default function HelpRootPage(): React.ReactNode {
  return <HelpGettingStartedPage />;
}
