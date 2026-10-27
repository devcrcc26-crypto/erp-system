import HelpLayout from '@/components/help/HelpLayout';

/** User guide pages share the ERP shell (sidebar, header, auth). */
export default function HelpRouteLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <HelpLayout>{children}</HelpLayout>;
}
