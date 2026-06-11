'use client';

import Link from 'next/link';
import { Search, Menu } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUser } from '@/lib/query/users';

export default function DashboardHeader({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick?: () => void;
}) {
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
  const roleName =
    userDetail?.userRoles?.[0]?.role?.name ?? 'User';

  return (
    <header className="mb-4 mt-1 flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm md:mb-6 md:mt-2 md:px-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          onClick={onMenuClick}
          className="mt-1 shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{title}</h1>
          <div className="relative mt-2">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              placeholder="Search projects..."
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100 sm:w-[50%] md:w-[40%] lg:w-[30%]"
            />
          </div>
        </div>
      </div>

      <Link
        href="/profile"
        className="flex shrink-0 items-center gap-2 rounded-md transition-colors hover:bg-slate-50 md:gap-3 md:px-2 md:py-1"
        aria-label="Open profile"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white md:h-10 md:w-10 md:text-sm">
          {avatarInitial}
        </div>
        <div className="hidden text-sm md:block">
          <p className="font-semibold text-slate-900">{displayName}</p>
          <p className="text-slate-500">{roleName}</p>
        </div>
      </Link>
    </header>
  );
}
