'use client';

/* TEMPORARY visual check for sidebar + header redesign - delete before finishing. */
import '@/components/sidebar/sidebar.css';
import { useEffect, useState } from 'react';
import SidebarShell from '@/components/sidebar/SidebarShell';
import MainContentHeader from '@/components/ui/shell/MainContentHeader';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from 'antd';

export default function ShellPreviewPage(): React.ReactNode {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    useAuthStore.setState({
      user: {
        id: 'preview-user',
        email: 'jinxia.dong@company.local',
        firstName: 'Jinxia',
        lastName: 'Dong',
        companyId: 'preview-co',
      },
      capabilitiesReady: true,
      capabilities: {
        ...EMPTY_CAPABILITIES,
        isSystemAdministrator: true,
        canViewHr: true,
        canManageUsers: true,
        canManageRoles: true,
        canEditRoles: true,
        canViewAuditLogs: true,
        hasDirectReports: true,
        canAccessPayroll: true,
        canCreatePurchaseRequest: true,
      },
    });
    setSeeded(true);
  }, []);

  if (!seeded) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <a href="#main-content" className="erp-skip-link">
        Skip to main content
      </a>

      <SidebarShell
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        project={null}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="erp-shell-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <MainContentHeader
          breadcrumbs={[
            { label: 'Home', href: '/login' },
            { label: 'People', href: '/login' },
            { label: 'Employees' },
          ]}
          pageTitle="Employees"
          pageSubtitle="Manage staff records, contracts and department assignments"
          onOpenMobileNav={() => setMobileOpen(true)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-card-border)] bg-white p-5 shadow-[var(--shadow-panel)]">
            <Button type="primary" onClick={() => setMobileOpen(true)}>
              Open mobile drawer preview
            </Button>
            <span className="text-sm text-slate-600">
              Hover or click a folder in the left rail (e.g. People) to inspect the flyout / pinned panel.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
