'use client';

import EpcLocaleProvider from '@/components/providers/EpcLocaleProvider';
import { RoleLensProvider } from '@/components/modules/projects/workspaces/RoleLensProvider';

/**
 * Client providers for all authenticated dashboard routes (global + project).
 */
export default function DashboardProviders({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <EpcLocaleProvider>
      <RoleLensProvider>{children}</RoleLensProvider>
    </EpcLocaleProvider>
  );
}
