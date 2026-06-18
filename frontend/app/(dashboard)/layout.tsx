import AppShell from '@/components/ui/AppShell/AppShell';
import EpcLocaleProvider from '@/components/providers/EpcLocaleProvider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <EpcLocaleProvider>
      <AppShell>{children}</AppShell>
    </EpcLocaleProvider>
  );
}
