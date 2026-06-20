'use client';

import Link from 'next/link';
import { Avatar } from 'antd';
import NotificationPanel from '@/components/ui/NotificationPanel/NotificationPanel';
import { useAuthStore } from '@/stores/auth.store';
import { useUser } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';

/**
 * Notifications bell and signed-in user profile link — shared by page and project headers.
 */
export default function HeaderActions(): React.ReactNode {
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
    <div className="flex shrink-0 items-center gap-2 self-start pt-1 md:gap-3">
      <NotificationPanel />
      <Link
        href="/profile"
        className="flex shrink-0 items-center gap-2 rounded-md transition-colors hover:bg-slate-50 md:gap-3 md:px-2 md:py-1"
        aria-label="Open profile"
      >
        <Avatar
          size={{ xs: 36, md: 40 }}
          style={{ backgroundColor: tokens.colorSidebarBg, fontWeight: 600 }}
        >
          {avatarInitial}
        </Avatar>
        <div className="hidden text-sm md:block">
          <p className="font-semibold text-slate-900">{displayName}</p>
          <p className="text-slate-500">{roleName}</p>
        </div>
      </Link>
    </div>
  );
}
