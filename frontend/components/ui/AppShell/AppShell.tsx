'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Layout, Menu, Drawer, Button } from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  BarChartOutlined,
  MailOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import { tokens } from '@/lib/theme/tokens';
import { useLogout } from '@/lib/query/auth';
import { signOutLocally } from '@/lib/auth/sign-out-locally';

const { Sider, Content } = Layout;

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/projects': 'Projects',
  '/kanban-board': 'Kanban Board',
  '/users': 'Users',
  '/teams': 'Teams',
  '/reports': 'Reports',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/profile': 'Profile',
};

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { key: '/', label: 'Dashboard', href: '/', icon: <DashboardOutlined /> },
  { key: '/projects', label: 'Projects', href: '/projects', icon: <ProjectOutlined /> },
  {
    key: '/kanban-board',
    label: 'Kanban Board',
    href: '/kanban-board',
    icon: <UnorderedListOutlined />,
  },
  { key: '/users', label: 'Users', href: '/users', icon: <TeamOutlined /> },
  { key: '/teams', label: 'Teams', href: '/teams', icon: <TeamOutlined /> },
  { key: '/reports', label: 'Reports', href: '/reports', icon: <BarChartOutlined /> },
  { key: '/messages', label: 'Messages', href: '/messages', icon: <MailOutlined /> },
  { key: '/settings', label: 'Settings', href: '/settings', icon: <SettingOutlined /> },
];

function SidebarBrand({ onClose }: { onClose?: () => void }): React.ReactNode {
  return (
    <div className="flex items-center justify-between px-7 pb-5 pt-8">
      <h1 className="text-xl font-bold tracking-wide text-white">CCECC PWF</h1>
      {onClose && (
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={onClose}
          className="!text-slate-400 hover:!text-white md:!hidden"
          aria-label="Close menu"
        />
      )}
    </div>
  );
}

function SidebarNav({
  onNavigate,
}: {
  onNavigate?: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();

  const selectedKey =
    pathname === '/profile'
      ? '/profile'
      : (NAV_ITEMS.find(
          (item) => item.href !== '/' && pathname.startsWith(item.href),
        )?.key ?? '/');

  const menuItems: MenuProps['items'] = [
    ...NAV_ITEMS.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: (
        <Link href={item.href} onClick={onNavigate}>
          {item.label}
        </Link>
      ),
    })),
    { type: 'divider' as const },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: (
        <Link href="/profile" onClick={onNavigate}>
          Profile
        </Link>
      ),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: logout.isPending ? 'Signing out…' : 'Logout',
      disabled: logout.isPending,
    },
  ];

  async function handleMenuClick({ key }: { key: string }): Promise<void> {
    if (key === 'logout') {
      try {
        await logout.mutateAsync();
      } catch {
        signOutLocally();
      }
      onNavigate?.();
      router.replace('/login');
    }
  }

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={handleMenuClick}
      style={{
        background: tokens.colorSidebarBg,
        borderInlineEnd: 'none',
      }}
      className="erp-sidebar-menu"
    />
  );
}

function SidebarPanel({ onClose }: { onClose?: () => void }): React.ReactNode {
  return (
    <div className="flex h-full flex-col" style={{ background: tokens.colorSidebarBg }}>
      <SidebarBrand onClose={onClose} />
      <hr className="border-slate-700" />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}

/**
 * Application shell — same layout as DashboardShell, built on Ant Design Layout.
 */
export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setMobileOpen(false);
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return (
    <Layout className="!min-h-full !h-full">
      <Sider
        width={tokens.sidebarWidth}
        className="!hidden md:!block"
        style={{
          background: tokens.colorSidebarBg,
          height: '100vh',
          position: 'sticky',
          top: 0,
          overflow: 'auto',
        }}
      >
        <SidebarPanel />
      </Sider>

      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        size={tokens.sidebarWidth}
        closable={false}
        styles={{
          body: { padding: 0, background: tokens.colorSidebarBg },
        }}
        className="md:hidden"
      >
        <SidebarPanel onClose={() => setMobileOpen(false)} />
      </Drawer>

      <Layout style={{ background: tokens.colorPageBg }}>
        <Content className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex-1 p-4 md:p-6">
            <PageHeader
              title={title}
              onMenuClick={() => setMobileOpen(true)}
            />
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
