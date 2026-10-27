import type { Metadata } from 'next';
import HelpPortal from '@/components/help/HelpPortal';

export const metadata: Metadata = {
  title: 'User Guide | EPC ERP',
  description: 'Bilingual user guide for the Construction ERP system',
};

/**
 * Help portal layout — no ERP AppShell.
 * One client portal owns auth + chrome so RSC children hydrate stably.
 */
export default function HelpGroupLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <HelpPortal>{children}</HelpPortal>;
}
