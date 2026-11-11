'use client';

import type { ReactNode } from 'react';

/**
 * Frame for user guide pages inside the normal ERP shell. Topics are listed in
 * the main sidebar (User Guide folder in `sidebar.config.ts`), and the guide
 * follows the ERP language from the header Language control.
 */
export default function HelpLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <div className="erp-help-page mx-auto w-full max-w-[1040px]">{children}</div>;
}
