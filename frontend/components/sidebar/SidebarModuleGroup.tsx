'use client';

import { ChevronRight } from 'lucide-react';

/**
 * Collapsible section inside a module panel (People, Time & Leave, …).
 * The header is a disclosure button; items are rendered as `<li>` children.
 */
export default function SidebarModuleGroup({
  id,
  label,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.ReactNode {
  const listId = `sb-group-${id}`;

  return (
    <div className="sb-group">
      <button
        type="button"
        className="sb-group-toggle erp-sidebar-group-title"
        aria-expanded={!collapsed}
        aria-controls={listId}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="sb-chevron" aria-hidden>
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </button>
      <ul id={listId} className="sb-list" hidden={collapsed}>
        {children}
      </ul>
    </div>
  );
}
