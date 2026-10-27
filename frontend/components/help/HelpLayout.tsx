'use client';

import type { ReactNode } from 'react';
import LanguageControl from '@/components/ui/LanguageControl/LanguageControl';

/**
 * Frame for a user guide article inside the normal ERP shell. Topics are
 * listed in the main sidebar (User Guide folder in `sidebar.config.ts`); the
 * guide follows the ERP language, switched from the top of the article.
 */
export default function HelpLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <section className="erp-pro-card erp-help-page">
      <div className="flex justify-end border-b border-[#EEF1F4] px-4 py-2">
        <LanguageControl />
      </div>
      <div className="px-6 py-6 md:px-8">
        <div className="mx-auto max-w-[860px]">{children}</div>
      </div>
    </section>
  );
}
