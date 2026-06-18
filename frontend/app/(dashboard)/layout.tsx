import AppShell from '@/components/ui/AppShell/AppShell';
import DashboardProviders from '@/components/providers/DashboardProviders';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <DashboardProviders>
      <AppShell>{children}</AppShell>
    </DashboardProviders>
  );
}
