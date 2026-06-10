"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import DashboardHeader from "@/components/DashboardHeader";

const PAGE_TITLES: Record<string, string> = {
  "/":             "Dashboard",
  "/projects":     "Projects",
  "/kanban-board": "Kanban Board",
  "/team":         "Team",
  "/reports":      "Reports",
  "/messages":     "Messages",
  "/settings":     "Settings",
  "/logout":       "Logout",
};

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  // Close drawer when resizing to desktop
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* ── Desktop sidebar (always visible) ── */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {sidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ backgroundColor: "#f1f5f9" }}
      >
        <div className="flex-1 p-4 md:p-6">
          <DashboardHeader title={title} onMenuClick={() => setSidebarOpen(true)} />
          {children}
        </div>
      </main>
    </div>
  );
}
