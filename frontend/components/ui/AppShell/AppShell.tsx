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
  InboxOutlined,
  CommentOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import {
  useCanViewMyComments,
  useCanViewReviewInbox,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { useLogout } from '@/lib/query/auth';
import { signOutLocally } from '@/lib/auth/sign-out-locally';

const { Sider, Content } = Layout;

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/kanban-board': 'nav.kanbanBoard',
  '/review-inbox': 'pages.reviewInbox.title',
  '/my-comments': 'pages.myComments.title',
  '/users': 'nav.users',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
};

type NavItem = {
  key: string;
  labelKey: string;
  href: string;
  icon: React.ReactNode;
  visible: boolean;
};

function buildNavItems(
  canViewReviewInbox: boolean,
  canViewMyComments: boolean,
): NavItem[] {
  return [
    { key: '/', labelKey: 'nav.dashboard', href: '/', icon: <DashboardOutlined />, visible: true },
    { key: '/projects', labelKey: 'nav.projects', href: '/projects', icon: <ProjectOutlined />, visible: true },
    {
      key: '/review-inbox',
      labelKey: 'nav.reviewInbox',
      href: '/review-inbox',
      icon: <InboxOutlined />,
      visible: canViewReviewInbox,
    },
    {
      key: '/my-comments',
      labelKey: 'nav.myComments',
      href: '/my-comments',
      icon: <CommentOutlined />,
      visible: canViewMyComments,
    },
    {
      key: '/kanban-board',
      labelKey: 'nav.kanbanBoard',
      href: '/kanban-board',
      icon: <UnorderedListOutlined />,
      visible: true,
    },
    { key: '/users', labelKey: 'nav.users', href: '/users', icon: <TeamOutlined />, visible: true },
    { key: '/teams', labelKey: 'nav.teams', href: '/teams', icon: <TeamOutlined />, visible: true },
    { key: '/reports', labelKey: 'nav.reports', href: '/reports', icon: <BarChartOutlined />, visible: true },
    { key: '/messages', labelKey: 'nav.messages', href: '/messages', icon: <MailOutlined />, visible: true },
    { key: '/settings', labelKey: 'nav.settings', href: '/settings', icon: <SettingOutlined />, visible: true },
  ];
}

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
  const canViewReviewInbox = useCanViewReviewInbox();
  const canViewMyComments = useCanViewMyComments();
  const { t } = useEpcTranslation();

  const navItems = buildNavItems(canViewReviewInbox, canViewMyComments);
  const visibleNavItems = navItems.filter((item) => item.visible);

  const selectedKey =
    pathname === '/profile'
      ? '/profile'
      : (visibleNavItems.find(
          (item) => item.href !== '/' && pathname.startsWith(item.href),
        )?.key ?? '/');

  const menuItems: MenuProps['items'] = [
    ...visibleNavItems.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: (
        <Link href={item.href} onClick={onNavigate}>
          {t(item.labelKey)}
        </Link>
      ),
    })),
    { type: 'divider' as const },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: (
        <Link href="/profile" onClick={onNavigate}>
          {t('nav.profile')}
        </Link>
      ),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: logout.isPending ? t('nav.signingOut') : t('nav.logout'),
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
  const { t } = useEpcTranslation();

  const isProjectDetailPage = /^\/projects\/[^/]+/.test(pathname);

  const title = pathname.startsWith('/projects')
    ? t('nav.projects')
    : pathname.startsWith('/design-packages')
      ? t('pages.reviewMode.title')
      : (PAGE_TITLE_KEYS[pathname]
          ? t(PAGE_TITLE_KEYS[pathname])
          : t('nav.dashboard'));

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
          <div className="flex-1 p-6 md:p-8">
            <div className={layout.pageStack}>
              {isProjectDetailPage ? (
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
                  aria-label="Open menu"
                >
                  <MenuOutlined style={{ fontSize: 22 }} />
                </button>
              ) : (
                <PageHeader
                  title={title}
                  onMenuClick={() => setMobileOpen(true)}
                />
              )}
              {children}
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
