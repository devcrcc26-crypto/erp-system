'use client';

import type { ReactNode } from 'react';
import HelpArticle from '@/components/help/HelpArticle';

/**
 * Getting Started article without any client/server redirect.
 * Used by both `/help` and as the safe fallback when a topic is forbidden.
 */
export function HelpGettingStartedPage(): ReactNode {
  return <HelpArticle slug="getting-started" />;
}
