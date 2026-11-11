"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Network,
  ListChecks,
  BarChart3,
  Mail,
  Settings,
  User,
  Users,
  LogOut,
  X,
} from "lucide-react";
import type { SVGProps, ReactElement } from "react";
import ThreePeopleIcon from "@/components/ThreePeopleIcon";
import { useLogout } from "@/lib/query/auth";
import { signOutLocally } from "@/lib/auth/sign-out-locally";

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

const navItems: { label: string; href: string; icon: IconComponent }[] = [
  { label: "Dashboard",    href: "/",             icon: LayoutDashboard as IconComponent },
  { label: "Projects",     href: "/projects",     icon: Network as IconComponent },
  { label: "Kanban Board", href: "/kanban-board", icon: ListChecks as IconComponent },
  { label: "Users",        href: "/users",        icon: Users as IconComponent },
  { label: "Teams",        href: "/teams",        icon: ThreePeopleIcon as IconComponent },
  { label: "Reports",      href: "/reports",      icon: BarChart3 as IconComponent },
  { label: "Messages",     href: "/messages",     icon: Mail as IconComponent },
  { label: "Settings",     href: "/settings",     icon: Settings as IconComponent },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={isActive ? { backgroundColor: "#334155" } : undefined}
      className={[
        "flex items-center gap-4 border-l-4 py-4 pl-6 pr-6 text-sm transition-colors",
        isActive
          ? "border-orange-500 font-semibold text-white"
          : "border-transparent font-normal text-slate-400 hover:text-white",
      ].join(" ")}
    >
      <Icon width={18} height={18} className="shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function LogoutButton({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  const logout = useLogout();

  async function handleLogout(): Promise<void> {
    try {
      await logout.mutateAsync();
    } catch {
      // ignore — always clear and redirect
    } finally {
      signOutLocally();
      onClick?.();
      router.replace('/login');
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={logout.isPending}
      className="flex w-full items-center gap-4 border-l-4 border-transparent py-4 pl-6 pr-6 text-sm font-normal text-slate-400 transition-colors hover:text-white disabled:opacity-60"
    >
      <LogOut width={18} height={18} className="shrink-0" />
      <span>{logout.isPending ? 'Signing out…' : 'Logout'}</span>
    </button>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col"
      style={{ backgroundColor: "#1e293b" }}
    >
      <header className="flex items-center justify-between px-7 pb-5 pt-8">
        <h1 className="text-xl font-bold tracking-wide text-white">CCECC</h1>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 transition-colors hover:text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </header>

      <hr className="border-slate-700" />

      <nav className="flex-1">
        <ul>
          {navItems.map(({ label, href, icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                label={label}
                icon={icon}
                isActive={pathname === href}
                onClick={onClose}
              />
            </li>
          ))}
          <li>
            <NavLink
              href="/profile"
              label="Profile"
              icon={User as IconComponent}
              isActive={pathname === '/profile'}
              onClick={onClose}
            />
          </li>
          <li>
            <LogoutButton onClick={onClose} />
          </li>
        </ul>
      </nav>
    </aside>
  );
}
