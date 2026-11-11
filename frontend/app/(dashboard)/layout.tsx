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
        {/*
          Fixed to the viewport so document scroll cannot leave empty space
          under the shell (min-height chains / scrollIntoView side effects).
        */}
        <div className="fixed inset-0 flex flex-col overflow-hidden">
          <AppShell>{children}</AppShell>
        </div>
      </DashboardAuthGate>
    </DashboardProviders>
  );
}
