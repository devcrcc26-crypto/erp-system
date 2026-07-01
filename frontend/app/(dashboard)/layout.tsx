import AppShell from '@/components/ui/AppShell/AppShell';
import DashboardProviders from '@/components/providers/DashboardProviders';
import DashboardAuthGate from '@/components/auth/DashboardAuthGate';

// UI polish pass - styles only, no logic changes

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <DashboardProviders>
      <DashboardAuthGate>
        <div className="flex h-screen min-h-0 flex-col overflow-hidden">
          <AppShell>{children}</AppShell>
        </div>
      </DashboardAuthGate>
    </DashboardProviders>
  );
}
