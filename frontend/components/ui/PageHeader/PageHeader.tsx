'use client';

import Link from 'next/link';
import { Input, Avatar } from 'antd';
import { SearchOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useUser } from '@/lib/query/users';

export default function PageHeader({
  title,
  onMenuClick,
  searchPlaceholder = 'Search projects...',
  showSearch = true,
}: {
  title: string;
  onMenuClick?: () => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
}): React.ReactNode {
  const user = useAuthStore((state) => state.user);
  const canManageUsers = useAuthStore(
    (state) => state.capabilities.canManageUsers,
  );
  const { data: userDetail } = useUser(
    user?.id ?? '',
    Boolean(user?.id) && canManageUsers,
  );

  const displayName = user
    ? `${user.firstName} ${user.lastName}`
    : 'User';
  const avatarInitial = user?.firstName?.charAt(0)?.toUpperCase() ?? 'U';
  const roleName = userDetail?.userRoles?.[0]?.role?.name ?? 'User';

  return (
    <header
      className="mb-4 mt-1 flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm md:mb-6 md:mt-2 md:px-6"
      style={{ borderRadius: 6 }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="mt-1 shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <MenuOutlined style={{ fontSize: 22 }} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{title}</h1>
          {showSearch && (
            <div className="mt-2 w-full sm:w-[50%] md:w-[40%] lg:w-[30%]">
              <Input
                prefix={<SearchOutlined className="text-slate-400" />}
                placeholder={searchPlaceholder}
                allowClear
              />
            </div>
          )}
        </div>
      </div>

      <Link
        href="/profile"
        className="flex shrink-0 items-center gap-2 rounded-md transition-colors hover:bg-slate-50 md:gap-3 md:px-2 md:py-1"
        aria-label="Open profile"
      >
        <Avatar
          size={{ xs: 36, md: 40 }}
          style={{ backgroundColor: '#1e293b', fontWeight: 600 }}
        >
          {avatarInitial}
        </Avatar>
        <div className="hidden text-sm md:block">
          <p className="font-semibold text-slate-900">{displayName}</p>
          <p className="text-slate-500">{roleName}</p>
        </div>
      </Link>
    </header>
  );
}
